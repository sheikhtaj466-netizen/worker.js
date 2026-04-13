export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 🛠️ DEBUG REDIS FUNCTION
    const redis = async (command, ...args) => {
      if (!env.UPSTASH_URL) throw new Error("Cloudflare Settings me UPSTASH_URL missing hai");
      if (!env.UPSTASH_TOKEN) throw new Error("Cloudflare Settings me UPSTASH_TOKEN missing hai");
      
      const response = await fetch(env.UPSTASH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([command, ...args]),
      });
      const data = await response.json();
      if (data.error) throw new Error(`Upstash Database Error: ${data.error}`);
      return data.result;
    };

    const url = new URL(request.url);

    // ==========================================
    // 🚀 ROUTE 1: SEND OTP (DEBUG ENABLED)
    // ==========================================
    if (url.pathname === "/send-otp" && request.method === "POST") {
      try {
        const body = await request.json();
        const email = body.email;
        if (!email) throw new Error("App se email receive nahi hua");

        const normalizedEmail = email.toLowerCase().trim();

        const cooldownTTL = await redis("TTL", `cooldown:${normalizedEmail}`);
        if (cooldownTTL > 0) throw new Error(`Please wait ${cooldownTTL} seconds`);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const today = new Date().toISOString().split('T')[0];

        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),          
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),      
          redis("DEL", `tries:${normalizedEmail}`),                        
          redis("INCR", `daily_emails:${today}`)                           
        ]);

        if (!env.BREVO_API_KEY) throw new Error("Cloudflare Settings me BREVO_API_KEY missing hai");
        if (!env.SENDER_EMAIL) throw new Error("Cloudflare Settings me SENDER_EMAIL missing hai");

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: "SafeLocker: Recovery OTP",
            htmlContent: `<div style="text-align: center;"><h2>Your Code</h2><h1>${otp}</h1></div>`
          })
        });

        if (!brevoRes.ok) {
          const errText = await brevoRes.text();
          throw new Error(`Brevo Email Error: ${errText}`);
        }

        return new Response(JSON.stringify({ success: true, message: "OTP sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        // EXACT ERROR EXPOSED HERE
        return new Response(JSON.stringify({ success: false, message: `SYSTEM ERROR: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // 🔐 ROUTE 2: VERIFY OTP (DEBUG ENABLED)
    // ==========================================
    if (url.pathname === "/verify-otp" && request.method === "POST") {
      try {
        const { email, otp } = await request.json();
        const normalizedEmail = email.toLowerCase().trim();

        const currentTries = await redis("GET", `tries:${normalizedEmail}`);
        if (currentTries && parseInt(currentTries) >= 5) throw new Error("Too many wrong attempts.");

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
        return new Response(JSON.stringify({ success: false, message: `VERIFY ERROR: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // ☁️ ROUTE 3: SEND CLOUD BACKUP
    // ==========================================
    if (url.pathname === "/send-backup" && request.method === "POST") {
      try {
        const { email, backupData, hint, deviceId, isEmergencyReset } = await request.json();
        if (!email || !backupData) throw new Error("Email/Backup data missing");
        const normalizedEmail = email.toLowerCase().trim();
        const base64Backup = btoa(unescape(encodeURIComponent(backupData)));
        
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: isEmergencyReset ? "🚨 SafeLocker: EMERGENCY RESET BACKUP" : "SafeLocker: Secure Cloud Backup",
            htmlContent: `<h2>Your SafeLocker Backup</h2><p>Device: ${deviceId || 'Unknown'}</p><p>Hint: ${hint || 'None'}</p>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Backup_${new Date().toISOString().split('T')[0]}.json` }]
          })
        });

        if (!brevoRes.ok) throw new Error(`Brevo Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true, message: "Backup sent!" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
         return new Response(JSON.stringify({ success: false, message: `BACKUP ERROR: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          method: "POST",
          headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: "🚨 SafeLocker: FINAL VAULT WIPE BACKUP",
            htmlContent: `<h2>Final Encrypted Backup</h2><p>Device: ${device || 'Unknown'}</p><p>Time: ${time || 'Unknown'}</p>`,
            attachment: [{ content: base64Backup, name: `SafeLocker_Wipe_Backup_${Date.now()}.json` }]
          })
        });

        if (!brevoRes.ok) throw new Error(`Brevo Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true, message: "Wipe Backup sent!" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: `WIPE ERROR: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response("Endpoint Not Found", { status: 404 });
  },
};
            
