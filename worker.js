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
    // 🚀 ROUTE 1: SEND OTP (WITH PREMIUM HTML)
    // ==========================================
    if (url.pathname === "/send-otp" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, otpType } = body;
        if (!email) throw new Error("Email missing from app");

        const normalizedEmail = email.toLowerCase().trim();

        const cooldownTTL = await redis("TTL", `cooldown:${normalizedEmail}`);
        if (cooldownTTL > 0) throw new Error(`Wait ${cooldownTTL}s`);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const today = new Date().toISOString().split('T')[0];

        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),          
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),      
          redis("DEL", `tries:${normalizedEmail}`),                        
          redis("INCR", `daily_emails:${today}`)                           
        ]);

        // 🎨 PREMIUM UI LOGIC
        let title = "SafeLocker OTP";
        let subtitle = "Your secure verification code";
        let color = "#6C5CE7"; // Primary Purple
        let icon = "🛡️";

        if (otpType === 'VAULT_WIPE') {
          title = "Vault Reset Authorization";
          subtitle = "You requested to PERMANENTLY WIPE your vault.";
          color = "#EF4444"; // Danger Red
          icon = "🚨";
        } else if (otpType === 'VERIFY_EMAIL') {
          title = "Email Verification";
          subtitle = "Link this email to your SafeLocker account.";
          color = "#10B981"; // Success Green
          icon = "✅";
        } else if (otpType === 'RECOVERY') {
          title = "Vault Recovery";
          subtitle = "Code to decrypt and restore your vault access.";
          color = "#F59E0B"; // Warning Orange
          icon = "🔑";
        }

        const htmlTemplate = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F9FAFB; padding: 40px 20px; margin: 0;">
          <div style="max-width: 480px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
            <div style="width: 72px; height: 72px; background-color: ${color}15; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 32px;">${icon}</span>
            </div>
            <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px;">${title}</h1>
            <p style="color: #6B7280; font-size: 15px; margin: 0 0 32px;">${subtitle}</p>
            
            <div style="background-color: #F9FAFB; border: 2px solid #F3F4F6; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
              <h2 style="color: ${color}; font-size: 42px; font-weight: 900; letter-spacing: 12px; margin: 0; margin-left: 12px;">${otp}</h2>
            </div>
            
            <p style="color: #9CA3AF; font-size: 13px; margin: 0; line-height: 1.5;">Valid for exactly 5 minutes.<br>If you didn't request this, ignore this email.</p>
          </div>
        </div>`;

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: `${icon} SafeLocker: ${title}`,
            htmlContent: htmlTemplate
          })
        });

        if (!brevoRes.ok) throw new Error(`Brevo Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true, message: "OTP sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        const normalizedEmail = email.toLowerCase().trim();

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
    // ☁️ ROUTE 3: SEND CLOUD BACKUP
    // ==========================================
    if (url.pathname === "/send-backup" && request.method === "POST") {
      try {
        const { email, backupData, hint, deviceId, isEmergencyReset } = await request.json();
        const normalizedEmail = email.toLowerCase().trim();
        const base64Backup = btoa(unescape(encodeURIComponent(backupData)));
        
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: isEmergencyReset ? "🚨 SafeLocker: EMERGENCY RESET BACKUP" : "SafeLocker: Secure Cloud Backup",
            htmlContent: `<div style="font-family: sans-serif; padding: 20px;"><h2>Your SafeLocker Backup</h2><p>Device: ${deviceId || 'Unknown'}</p><p>Hint: ${hint || 'None'}</p></div>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Backup_${new Date().toISOString().split('T')[0]}.json` }]
          })
        });

        if (!brevoRes.ok) throw new Error("Backup delivery failed");
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
         return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // 🌪️ ROUTE 4: SEND WIPE BACKUP
    // ==========================================
    if (url.pathname === "/send-wipe-backup" && request.method === "POST") {
      try {
        const { email, backupData, device, time } = await request.json();
        const normalizedEmail = email.toLowerCase().trim();
        const backupString = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
        const base64Backup = btoa(unescape(encodeURIComponent(backupString)));

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: "🚨 SafeLocker: FINAL VAULT WIPE BACKUP",
            htmlContent: `<div style="font-family: sans-serif; padding: 20px;"><h2>Final Encrypted Backup</h2><p>Device: ${device || 'Unknown'}</p><p>Time: ${time || 'Unknown'}</p></div>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Wipe_Backup_${Date.now()}.json` }]
          })
        });

        if (!brevoRes.ok) throw new Error("Wipe Backup delivery failed");
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response("Endpoint Not Found", { status: 404 });
  },
};
