export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const redis = async (command, ...args) => {
      const response = await fetch(env.UPSTASH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([command, ...args]),
      });
      return (await response.json()).result;
    };

    const url = new URL(request.url);

    // ==========================================
    // 🚀 ROUTE 1: SEND OTP
    // ==========================================
    if (url.pathname === "/send-otp" && request.method === "POST") {
      try {
        const { email } = await request.json();
        if (!email) throw new Error("Email is required");

        const normalizedEmail = email.toLowerCase().trim();

        // 🛑 RULE 1: Resend Cooldown Check (30 sec)
        const cooldownTTL = await redis("TTL", `cooldown:${normalizedEmail}`);
        if (cooldownTTL > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              message: `Please wait ${cooldownTTL} seconds before requesting a new OTP.`, 
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const today = new Date().toISOString().split('T')[0];

        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),          
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),      
          redis("DEL", `tries:${normalizedEmail}`),                        
          redis("INCR", `daily_emails:${today}`)                           
        ]);

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
            htmlContent: `
              <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2>Your Recovery Code</h2>
                <h1 style="color: #6C5CE7; letter-spacing: 5px;">${otp}</h1>
                <p>Valid for exactly 5 minutes.</p> 
              </div>`
          })
        });

        if (!brevoRes.ok) throw new Error("Email provider failed");

        return new Response(
          JSON.stringify({
            success: true,
            message: "OTP sent successfully. Valid for 5 minutes." 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, message: "Could not process request at this time." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ==========================================
    // 🔐 ROUTE 2: VERIFY OTP
    // ==========================================
    if (url.pathname === "/verify-otp" && request.method === "POST") {
      try {
        const { email, otp } = await request.json();
        const normalizedEmail = email.toLowerCase().trim();

        // 🛑 RULE 2: Max Verify Tries Check (5 Tries)
        const currentTries = await redis("GET", `tries:${normalizedEmail}`);
        if (currentTries && parseInt(currentTries) >= 5) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Account locked: Too many incorrect attempts. Please request a new OTP." 
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 🛑 RULE 3: OTP Validity / Expiry Check
        const storedOtp = await redis("GET", `otp:${normalizedEmail}`);
        if (!storedOtp) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "This OTP has expired or does not exist. Please request a new one." 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ✅ VERIFY LOGIC
        if (storedOtp === otp) {
          await Promise.all([
            redis("DEL", `otp:${normalizedEmail}`),
            redis("DEL", `tries:${normalizedEmail}`)
          ]);

          return new Response(
            JSON.stringify({ success: true, message: "Identity verified successfully!" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          await redis("INCR", `tries:${normalizedEmail}`);
          await redis("EXPIRE", `tries:${normalizedEmail}`, 300); 

          return new Response(
            JSON.stringify({
              success: false,
              message: "Incorrect OTP. Please check and try again." 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, message: "Verification failed. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Endpoint Not Found", { status: 404 });
  },
};
