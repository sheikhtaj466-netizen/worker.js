export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const redis = async (command, ...args) => {
      const response = await fetch(env.UPSTASH_URL, {
        method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify([command, ...args]),
      });
      return (await response.json()).result;
    };

    const url = new URL(request.url);

    // ==========================================
    // 🚀 ROUTE 1: SEND OTP (FIRE & FORGET ASYNC)
    // ==========================================
    if (url.pathname === "/send-otp" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, otpType } = body;
        if (!email) throw new Error("Email missing from app");

        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();

        const cooldownTTL = await redis("TTL", `cooldown:${normalizedEmail}`);
        if (cooldownTTL > 0) return new Response(JSON.stringify({ success: false, message: `Wait ${cooldownTTL}s` }), { status: 429, headers: corsHeaders });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const today = new Date().toISOString().split('T')[0];

        // Redis writes are extremely fast (< 10ms)
        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),          
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),      
          redis("DEL", `tries:${normalizedEmail}`),                        
          redis("INCR", `daily_emails:${today}`)                           
        ]);

        const config = {
          'VERIFY_EMAIL': { accent: '#3B82F6', title: 'Verify Access', icon: '🛡️', isDanger: false },
          'RECOVERY': { accent: '#10B981', title: 'Master PIN Recovery', icon: '🔑', isDanger: false },
          'VAULT_WIPE': { accent: '#EF4444', title: 'Emergency Vault Wipe', icon: '🚨', isDanger: true }
        };
        const theme = config[otpType] || config['VERIFY_EMAIL'];

        const htmlTemplate = `
          <div style="font-family: sans-serif; text-align: center; padding: 30px; background-color: #F8FAFC; border-radius: 20px; max-width: 500px; margin: auto;">
            <h1 style="color: ${theme.accent}; margin-bottom: 10px; font-size: 28px;">${theme.icon} ${theme.title}</h1>
            ${theme.isDanger ? '<p style="color: #EF4444; font-weight: bold;">⚠️ This action destroys all local vault data.</p>' : ''}
            <div style="font-size: 42px; font-weight: 900; letter-spacing: 12px; padding: 24px; border: 2px dashed ${theme.accent}; background-color: #FFFFFF; display: inline-block; border-radius: 16px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="color: #64748B; font-size: 14px;">Valid for exactly 5 minutes.<br>Do not share this code.</p>
          </div>
        `;

        // 🧠 SENIOR DEV FIX: Async Background Execution
        const sendEmailPromise = fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", 
          headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: `${theme.icon} SafeLocker: ${theme.title}`,
            htmlContent: htmlTemplate
          })
        }).catch(err => console.error("Brevo OTP Delivery failed:", err));

        ctx.waitUntil(sendEmailPromise); // Runs in edge background without blocking

        return new Response(JSON.stringify({ success: true, message: "OTP initiated" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // 🔐 ROUTE 2: VERIFY OTP
    // ==========================================
    if (url.pathname === "/verify-otp" && request.method === "POST") {
      try {
        const { email, otp } = await request.json();
        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();

        const currentTries = await redis("GET", `tries:${normalizedEmail}`);
        if (currentTries && parseInt(currentTries) >= 5) throw new Error("Account locked: Too many attempts.");

        const storedOtp = await redis("GET", `otp:${normalizedEmail}`);
        if (!storedOtp) throw new Error("OTP expired or invalid.");

        if (storedOtp === otp) {
          await Promise.all([ redis("DEL", `otp:${normalizedEmail}`), redis("DEL", `tries:${normalizedEmail}`) ]);
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          await redis("INCR", `tries:${normalizedEmail}`);
          await redis("EXPIRE", `tries:${normalizedEmail}`, 300); 
          throw new Error("Incorrect OTP.");
        }
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // ☁️ ROUTE 3: SEND CLOUD BACKUP (ASYNC)
    // ==========================================
    if (url.pathname === "/send-backup" && request.method === "POST") {
      try {
        const { email, backupData, hint, deviceId, isEmergencyReset } = await request.json();
        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();
        const base64Backup = btoa(unescape(encodeURIComponent(backupData)));
        
        const sendBackupPromise = fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: isEmergencyReset ? "🚨 SafeLocker: EMERGENCY RESET BACKUP" : "SafeLocker: Secure Cloud Backup",
            htmlContent: `<div style="font-family: sans-serif; padding: 20px;"><h2>Your SafeLocker Backup</h2><p>Device: ${deviceId || 'Unknown'}</p><p>Hint: ${hint || 'None'}</p></div>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Backup_${new Date().toISOString().split('T')[0]}.json` }]
          })
        }).catch(err => console.error("Backup Delivery failed:", err));

        ctx.waitUntil(sendBackupPromise);

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
         return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // 🌪️ ROUTE 4: SEND WIPE BACKUP (ASYNC)
    // ==========================================
    if (url.pathname === "/send-wipe-backup" && request.method === "POST") {
      try {
        const { email, backupData, device, time } = await request.json();
        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();
        const backupString = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
        const base64Backup = btoa(unescape(encodeURIComponent(backupString)));

        const sendWipeBackupPromise = fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: "🚨 SafeLocker: FINAL VAULT WIPE BACKUP",
            htmlContent: `<div style="font-family: sans-serif; padding: 20px;"><h2>Final Encrypted Backup</h2><p>Device: ${device || 'Unknown'}</p><p>Time: ${time || 'Unknown'}</p></div>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Wipe_Backup_${Date.now()}.json` }]
          })
        }).catch(err => console.error("Wipe Backup Delivery failed:", err));

        ctx.waitUntil(sendWipeBackupPromise);

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response("Endpoint Not Found", { status: 404 });
  },
};
                                            
