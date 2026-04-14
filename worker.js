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
    // 🚀 ROUTE 1: SEND OTP (STYLE UNTOUCHED - FIRE & FORGET FIX)
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

        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),          
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),      
          redis("DEL", `tries:${normalizedEmail}`),                        
          redis("INCR", `daily_emails:${today}`)                           
        ]);

        const config = {
          'VERIFY_EMAIL': { accent: '#3B82F6', grad: '#6366F1', bgTint: '#EFF6FF', icon: 'https://img.icons8.com/ios-filled/50/3B82F6/shield.png', title: 'Verify your SafeLocker access', sub: 'Your secure verification code' },
          'RECOVERY': { accent: '#10B981', grad: '#14B8A6', bgTint: '#ECFDF5', icon: 'https://img.icons8.com/ios-filled/50/10B981/key.png', title: 'Master PIN recovery verification', sub: 'Your secure recovery access code' },
          'VAULT_WIPE': { accent: '#EF4444', grad: '#F97316', bgTint: '#FEF2F2', icon: 'https://img.icons8.com/ios-filled/50/EF4444/warning-shield.png', title: 'Authorize emergency vault wipe', sub: 'OTP required to permanently destroy local vault data.', isDanger: true }
        };
        const theme = config[otpType] || config['VERIFY_EMAIL'];

        const otpSegments = otp.split('').map(digit => `
          <td style="padding: 0 4px;">
            <div style="width: 44px; height: 56px; background-color: ${theme.bgTint}; border: 1.5px solid ${theme.accent}; border-radius: 12px; text-align: center; line-height: 56px; font-size: 32px; font-weight: 900; color: ${theme.accent}; font-family: monospace;">
              ${digit}
            </div>
          </td>
        `).join('');

        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; padding: 24px 16px;">
            <tr>
              <td align="center">
                
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1.5px solid #E2E8F0; box-shadow: 0 10px 30px rgba(15,23,42,0.06);">
                  <tr><td height="5" style="background: linear-gradient(90deg, ${theme.accent}, ${theme.grad}); background-color: ${theme.accent};"></td></tr>
                  
                  <tr>
                    <td style="padding: 36px 24px; text-align: center;">
                      
                      <div style="width: 72px; height: 72px; background-color: ${theme.bgTint}; border-radius: 24px; margin: 0 auto 20px; display: inline-block;">
                        <img src="${theme.icon}" width="32" height="32" style="display: block; margin: 20px auto;" alt="icon" />
                      </div>
                      
                      <h1 style="color: #0F172A; font-size: 26px; font-weight: 900; margin: 0 0 8px; letter-spacing: -0.5px;">${theme.title}</h1>
                      <p style="color: #64748B; font-size: 16px; margin: 0 0 28px;">${theme.sub}</p>

                      ${theme.isDanger ? `
                      <div style="background-color: #FEF2F2; padding: 14px; border-radius: 14px; border: 1px solid #FECACA; margin-bottom: 28px;">
                        <p style="color: #DC2626; font-size: 14px; font-weight: 700; margin: 0;">⚠️ This action permanently erases local encrypted vault data.</p>
                      </div>` : ''}

                      <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 28px;">
                        <tr>${otpSegments}</tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 36px;">
                        <tr>
                          <td style="background-color: ${theme.bgTint}; padding: 8px 16px; border-radius: 999px;">
                            <span style="color: ${theme.accent}; font-size: 13px; font-weight: 700;">⏱️ Expires in 5 minutes</span>
                          </td>
                        </tr>
                      </table>

                      <div style="background-color: #F8FAFC; border-radius: 16px; padding: 18px; text-align: left; border: 1px solid #F1F5F9;">
                        <p style="margin: 0 0 10px; font-size: 12px; color: #64748B; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Security Meta Data</p>
                        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #94A3B8; font-weight: 500;">
                          <tr>
                            <td width="50%" style="padding-bottom: 8px;">Device: Mobile App</td>
                            <td width="50%" align="right" style="padding-bottom: 8px;">Time: ${new Date().toUTCString()}</td>
                          </tr>
                          <tr>
                            <td>IP: Masked via Edge</td>
                            <td align="right">Origin: Encrypted Vault</td>
                          </tr>
                        </table>
                      </div>

                    </td>
                  </tr>
                </table>

                <p style="text-align: center; font-size: 13px; color: #94A3B8; font-weight: 600; margin-top: 24px; line-height: 20px;">
                  SafeLocker Security Mail • End-to-End Protected<br>
                  <span style="font-size: 12px; font-weight: 500;">Please do not reply to this automated message.</span>
                </p>

              </td>
            </tr>
          </table>
        </body>
        </html>`;

        const sendEmailPromise = fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "accept": "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: `${theme.isDanger ? '🚨 ' : ''}${theme.title}`,
            htmlContent: htmlTemplate
          })
        }).catch(e => console.log("OTP Email Error:", e));

        ctx.waitUntil(sendEmailPromise);
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
    // ☁️ ROUTE 3: SEND CLOUD BACKUP (STRICT AWAIT FIX)
    // ==========================================
    if (url.pathname === "/send-backup" && request.method === "POST") {
      try {
        const { email, backupData, hint, deviceId, isEmergencyReset } = await request.json();
        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();
        
        const base64Backup = backupData; 
        
        // 🚨 SENIOR DEV FIX: Strict Await ensures we catch Brevo rejections immediately
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

        if (!brevoRes.ok) {
           const errText = await brevoRes.text();
           throw new Error(`Brevo Rejected: ${errText}`);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
         return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ==========================================
    // 🌪️ ROUTE 4: SEND WIPE BACKUP (STRICT AWAIT FIX)
    // ==========================================
    if (url.pathname === "/send-wipe-backup" && request.method === "POST") {
      try {
        const { email, backupData, device, time } = await request.json();
        const normalizedEmail = email.replace(/['"]+/g, '').toLowerCase().trim();
        
        const base64Backup = backupData;

        // 🚨 SENIOR DEV FIX: Strict Await ensures we catch Brevo rejections immediately
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

        if (!brevoRes.ok) {
           const errText = await brevoRes.text();
           throw new Error(`Brevo Rejected: ${errText}`);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response("Endpoint Not Found", { status: 404 });
  },
};
                              
