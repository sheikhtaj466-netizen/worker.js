// File: worker.js (SafeLocker v3.0 Official Security Mail Engine)
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. Environment Variables Validation
    if (!env.UPSTASH_URL || !env.UPSTASH_TOKEN || !env.BREVO_API_KEY || !env.SENDER_EMAIL) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Server Configuration Error: Missing UPSTASH or BREVO credentials in Cloudflare Worker.",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 2. Normalize Upstash URL
    let upstashUrl = String(env.UPSTASH_URL).trim();
    if (!upstashUrl.startsWith("http")) {
      upstashUrl = "https://" + upstashUrl;
    }

    // 3. Upstash Redis Helper
    const redis = async (command, ...args) => {
      const response = await fetch(upstashUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([command, ...args]),
      });
      if (!response.ok) throw new Error(`Redis Error: ${response.statusText}`);
      const data = await response.json();
      return data.result;
    };

    // 4. Safe Base64 Normalizer for .bak Attachments
    const cleanBase64 = (rawStr = "") => {
      const cleaned = String(rawStr).replace(/^data:([A-Za-z-+/]+);base64,/, "").trim();
      try {
        atob(cleaned.slice(0, 100));
        return cleaned;
      } catch (e) {
        return btoa(unescape(encodeURIComponent(cleaned)));
      }
    };

    // 5. IST Timestamp Helper
    const getISTTime = () =>
      new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }) + " IST";

    // ============================================================================
    // 🎨 SAFELOCKER v3.0 LUXURY MINIMALIST OTP EMAIL TEMPLATE
    // ============================================================================
    const buildOtpEmailHTML = ({ otp, theme, istTime, recipientEmail }) => {
      const digitBoxes = otp
        .split("")
        .map(
          (digit) => `
          <td style="padding: 0 3px;">
            <div style="width: 42px; height: 54px; background-color: #1E293B; border: 1.5px solid ${theme.borderHex}; border-radius: 12px; text-align: center; line-height: 54px; font-size: 26px; font-weight: 900; color: #F8FAFC; font-family: 'Courier New', Courier, monospace;">
              ${digit}
            </div>
          </td>`
        )
        .join("");

      return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${theme.subject}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 28px 14px;">
          <tr>
            <td align="center">
              
              <!-- Main Outer Card -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);">
                
                <!-- Top Accent Gradient Strip -->
                <tr>
                  <td height="6" style="background: linear-gradient(90deg, ${theme.accent}, ${theme.grad}); background-color: ${theme.accent};"></td>
                </tr>

                <!-- Brand Header Bar -->
                <tr>
                  <td style="padding: 28px 28px 0 28px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left">
                          <span style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 12px; font-weight: 900; letter-spacing: 0.8px; padding: 6px 12px; border-radius: 8px;">
                            🔒 SAFELOCKER <span style="color: ${theme.accent};">v3.0</span>
                          </span>
                        </td>
                        <td align="right">
                          <span style="display: inline-block; background-color: ${theme.bgTint}; color: ${theme.accent}; border: 1px solid ${theme.borderLight}; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; padding: 5px 11px; border-radius: 999px; text-transform: uppercase;">
                            ${theme.badgeText}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Main Body Content -->
                <tr>
                  <td style="padding: 26px 28px 32px 28px; text-align: center;">
                    
                    <h1 style="color: #0F172A; font-size: 23px; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -0.5px;">
                      ${theme.title}
                    </h1>
                    <p style="color: #64748B; font-size: 14px; font-weight: 500; margin: 0 0 24px 0; line-height: 21px;">
                      ${theme.subtitle}
                    </p>

                    ${
                      theme.isDanger
                        ? `<div style="background-color: #FEF2F2; padding: 12px 16px; border-radius: 14px; border: 1px solid #FECACA; margin-bottom: 22px; text-align: left;">
                            <p style="color: #DC2626; font-size: 12.5px; font-weight: 700; margin: 0; line-height: 18px;">
                              ⚠️ CRITICAL WARNING: Entering this OTP in SafeLocker will permanently wipe your local encrypted vault data.
                            </p>
                          </div>`
                        : ""
                    }

                    <!-- Dark Luxury OTP Vault Box -->
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #0F172A; border-radius: 22px; padding: 24px 14px; margin-bottom: 24px; border: 1px solid #1E293B;">
                      <tr>
                        <td align="center">
                          <p style="color: #94A3B8; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 14px 0;">
                            ${theme.otpBoxLabel}
                          </p>

                          <!-- 6-Digit Visual Grid -->
                          <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 16px;">
                            <tr>${digitBoxes}</tr>
                          </table>

                          <!-- Easy 1-Tap Copyable Code Pill -->
                          <div style="background-color: rgba(255, 255, 255, 0.05); border: 1px dashed #334155; border-radius: 10px; padding: 8px 16px; display: inline-block; margin-bottom: 12px;">
                            <span style="color: #94A3B8; font-size: 11px; font-weight: 600; margin-right: 6px;">Quick Copy:</span>
                            <span style="color: #FFFFFF; font-size: 15px; font-weight: 800; letter-spacing: 3px; font-family: 'Courier New', Courier, monospace; user-select: all; -webkit-user-select: all;">${otp}</span>
                          </div>

                          <div>
                            <span style="color: ${theme.accent}; font-size: 12px; font-weight: 700;">
                              ⏱️ Valid for 5 minutes • Single-Use Only
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Request Context & Security Metadata -->
                    <div style="background-color: #F8FAFC; border-radius: 16px; padding: 16px 18px; text-align: left; border: 1px solid #E2E8F0;">
                      <p style="margin: 0 0 10px 0; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">
                        Security Dispatch Details
                      </p>
                      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size: 12.5px; color: #64748B;">
                        <tr>
                          <td style="padding: 4px 0; font-weight: 600;">Request Type</td>
                          <td align="right" style="padding: 4px 0; color: #0F172A; font-weight: 800;">${theme.purposeLabel}</td>
                        </tr>
                        <tr>
                          <td style="padding: 4px 0; font-weight: 600;">Linked Account</td>
                          <td align="right" style="padding: 4px 0; color: #334155; font-weight: 700;">${recipientEmail}</td>
                        </tr>
                        <tr>
                          <td style="padding: 4px 0; font-weight: 600;">Time (IST)</td>
                          <td align="right" style="padding: 4px 0; color: #334155; font-weight: 700;">${istTime}</td>
                        </tr>
                        <tr>
                          <td style="padding: 4px 0; font-weight: 600;">Architecture</td>
                          <td align="right" style="padding: 4px 0; color: #10B981; font-weight: 800;">AES-256 Zero-Knowledge</td>
                        </tr>
                      </table>
                    </div>

                    <p style="color: #94A3B8; font-size: 12px; font-weight: 500; margin: 20px 0 0 0; line-height: 18px;">
                      If you did not request this code inside the SafeLocker app, you can safely ignore this email. Your offline vault remains locked.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Minimal Footer -->
              <p style="text-align: center; font-size: 12px; color: #64748B; font-weight: 700; margin: 20px 0 4px 0;">
                SafeLocker v3.0 Security Engine • Automated Dispatch
              </p>
              <p style="text-align: center; font-size: 11px; color: #94A3B8; font-weight: 500; margin: 0;">
                © 2026 SafeLocker • Zero Telemetry • Do not reply to this email.
              </p>

            </td>
          </tr>
        </table>
      </body>
      </html>`;
    };

    // ============================================================================
    // 🎨 SAFELOCKER v3.0 LUXURY BACKUP EMAIL TEMPLATE
    // ============================================================================
    const buildBackupEmailHTML = ({ heading, badgeText, accentColor, device, extraLabel, extraValue, fileName, istTime }) => `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 28px 14px;">
        <tr>
          <td align="center">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);">
              <tr><td height="6" style="background-color: ${accentColor};"></td></tr>
              <tr>
                <td style="padding: 28px 28px 0 28px;">
                  <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="left">
                        <span style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 12px; font-weight: 900; letter-spacing: 0.8px; padding: 6px 12px; border-radius: 8px;">
                          🔒 SAFELOCKER <span style="color: ${accentColor};">v3.0</span>
                        </span>
                      </td>
                      <td align="right">
                        <span style="display: inline-block; background-color: #EFF6FF; color: ${accentColor}; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; padding: 5px 11px; border-radius: 999px; text-transform: uppercase;">
                          ${badgeText}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 26px 28px 32px 28px; text-align: center;">
                  <h1 style="color: #0F172A; font-size: 22px; font-weight: 900; margin: 0 0 10px 0; letter-spacing: -0.4px;">${heading}</h1>
                  <p style="color: #64748B; font-size: 14px; margin: 0 0 22px 0; line-height: 21px;">
                    Your end-to-end encrypted vault snapshot is attached to this email as a <strong>.bak</strong> file. Keep it safe to restore your records anytime inside SafeLocker.
                  </p>

                  <!-- Attached File Pill -->
                  <div style="background-color: #0F172A; border-radius: 16px; padding: 14px 18px; margin-bottom: 22px; text-align: left; border: 1px solid #1E293B;">
                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 1px; text-transform: uppercase;">Attached Encrypted File</p>
                    <p style="margin: 0; font-size: 13.5px; font-weight: 800; color: #F8FAFC; font-family: monospace;">📦 ${fileName}</p>
                  </div>

                  <div style="background-color: #F8FAFC; border-radius: 16px; padding: 16px 18px; text-align: left; border: 1px solid #E2E8F0;">
                    <p style="margin: 0 0 10px 0; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Backup Metadata</p>
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size: 12.5px; color: #64748B;">
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600;">Source Device</td>
                        <td align="right" style="padding: 4px 0; color: #0F172A; font-weight: 700;">${device}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600;">${extraLabel}</td>
                        <td align="right" style="padding: 4px 0; color: #0F172A; font-weight: 700;">${extraValue}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600;">Created At</td>
                        <td align="right" style="padding: 4px 0; color: #0F172A; font-weight: 700;">${istTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600;">Cipher</td>
                        <td align="right" style="padding: 4px 0; color: #10B981; font-weight: 800;">AES-256 Protected</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>
            <p style="text-align: center; font-size: 12px; color: #64748B; font-weight: 700; margin-top: 20px;">
              SafeLocker v3.0 Security Engine • End-to-End Encrypted
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    const url = new URL(request.url);

    // Health Check Route
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({ status: "online", service: "SafeLocker v3.0 Security Worker" }),
        { status: 200, headers: corsHeaders }
      );
    }

    // ============================================================================
    // 🚀 ROUTE 1: SEND OTP (/send-otp)
    // ============================================================================
    if (url.pathname === "/send-otp" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, otpType } = body;
        if (!email) throw new Error("Email address is required.");

        const normalizedEmail = String(email).replace(/['"]+/g, "").toLowerCase().trim();
        const cooldownTTL = await redis("TTL", `cooldown:${normalizedEmail}`);
        if (cooldownTTL > 0) {
          return new Response(
            JSON.stringify({ success: false, message: `Please wait ${cooldownTTL}s before requesting another OTP.` }),
            { status: 429, headers: corsHeaders }
          );
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const istTime = getISTTime();

        // Clear and distinct OTP Themes so the user immediately knows WHICH OTP arrived
        const OTP_THEMES = {
          VERIFY_EMAIL: {
            badgeText: "Email Verification",
            purposeLabel: "Link Recovery Email",
            otpBoxLabel: "EMAIL VERIFICATION CODE",
            title: "Verify Your Recovery Email",
            subtitle: "Enter this 6-digit verification code in SafeLocker to link and activate your recovery email.",
            subject: `[${otp}] SafeLocker Email Verification Code`,
            accent: "#6C5CE7",
            grad: "#8B5CF6",
            bgTint: "#F5F3FF",
            borderLight: "#DDD6FE",
            borderHex: "#6C5CE7",
            isDanger: false,
          },
          RECOVERY: {
            badgeText: "PIN Recovery",
            purposeLabel: "Master PIN Reset",
            otpBoxLabel: "PIN RECOVERY OTP CODE",
            title: "Master PIN Recovery Request",
            subtitle: "Use this 6-digit security code in SafeLocker to verify your identity and reset your Master PIN.",
            subject: `[${otp}] SafeLocker Master PIN Recovery Code`,
            accent: "#10B981",
            grad: "#059669",
            bgTint: "#ECFDF5",
            borderLight: "#A7F3D0",
            borderHex: "#10B981",
            isDanger: false,
          },
          VAULT_WIPE: {
            badgeText: "Emergency Wipe",
            purposeLabel: "Permanent Vault Wipe",
            otpBoxLabel: "DESTRUCTIVE WIPE AUTHORIZATION CODE",
            title: "Authorize Emergency Vault Wipe",
            subtitle: "A request was triggered to permanently erase your local SafeLocker vault.",
            subject: `🚨 [${otp}] SafeLocker Emergency Vault Wipe Code`,
            accent: "#EF4444",
            grad: "#DC2626",
            bgTint: "#FEF2F2",
            borderLight: "#FECACA",
            borderHex: "#EF4444",
            isDanger: true,
          },
        };

        const theme = OTP_THEMES[otpType] || OTP_THEMES.VERIFY_EMAIL;

        // Save OTP & Cooldown in Upstash Redis
        await Promise.all([
          redis("SET", `otp:${normalizedEmail}`, otp, "EX", 300),
          redis("SET", `cooldown:${normalizedEmail}`, "1", "EX", 30),
          redis("DEL", `tries:${normalizedEmail}`),
        ]);

        const htmlContent = buildOtpEmailHTML({
          otp,
          theme,
          istTime,
          recipientEmail: normalizedEmail,
        });

        // Plain-text fallback helps Android/iOS notification banners auto-detect the OTP!
        const textContent = `SafeLocker v3.0 Security\n${theme.title}\n\nYour ${theme.purposeLabel} OTP is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`;

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: theme.subject,
            htmlContent,
            textContent,
          }),
        });

        if (!brevoRes.ok) {
          // Rollback cooldown if email delivery failed
          await redis("DEL", `cooldown:${normalizedEmail}`);
          const errText = await brevoRes.text();
          throw new Error(`Email dispatch failed: ${errText}`);
        }

        return new Response(
          JSON.stringify({ success: true, message: "OTP sent successfully" }),
          { status: 200, headers: corsHeaders }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ============================================================================
    // 🔐 ROUTE 2: VERIFY OTP (/verify-otp)
    // ============================================================================
    if (url.pathname === "/verify-otp" && request.method === "POST") {
      try {
        const { email, otp } = await request.json();
        if (!email || !otp) throw new Error("Email and OTP are required.");

        const normalizedEmail = String(email).replace(/['"]+/g, "").toLowerCase().trim();
        const enteredOtp = String(otp).trim();

        const currentTries = await redis("GET", `tries:${normalizedEmail}`);
        if (currentTries && parseInt(currentTries, 10) >= 5) {
          throw new Error("Too many failed attempts. Please request a new OTP after 5 minutes.");
        }

        const storedOtp = await redis("GET", `otp:${normalizedEmail}`);
        if (!storedOtp) {
          throw new Error("OTP has expired or was not found. Please request a new one.");
        }

        if (String(storedOtp).trim() === enteredOtp) {
          await Promise.all([
            redis("DEL", `otp:${normalizedEmail}`),
            redis("DEL", `tries:${normalizedEmail}`),
          ]);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: corsHeaders,
          });
        } else {
          await redis("INCR", `tries:${normalizedEmail}`);
          await redis("EXPIRE", `tries:${normalizedEmail}`, 300);
          throw new Error("Incorrect OTP code entered.");
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // ============================================================================
    // ☁️ ROUTE 3: SEND ENCRYPTED CLOUD BACKUP (/send-backup)
    // ============================================================================
    if (url.pathname === "/send-backup" && request.method === "POST") {
      try {
        const { email, backupData, hint, deviceId, isEmergencyReset } = await request.json();
        if (!email || !backupData) throw new Error("Missing email or backup payload.");

        const normalizedEmail = String(email).replace(/['"]+/g, "").toLowerCase().trim();
        const base64Backup = cleanBase64(backupData);
        const fileName = `SafeLocker_Backup_${new Date().toISOString().split("T")[0]}.bak`;

        const htmlContent = buildBackupEmailHTML({
          heading: isEmergencyReset ? "Pre-Reset Encrypted Vault Backup" : "Your Encrypted Vault Backup",
          badgeText: isEmergencyReset ? "Emergency Snapshot" : "Cloud Backup",
          accentColor: isEmergencyReset ? "#F59E0B" : "#6C5CE7",
          device: deviceId || "SafeLocker Android",
          extraLabel: "Password Hint",
          extraValue: hint || "None set",
          fileName,
          istTime: getISTTime(),
        });

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: isEmergencyReset
              ? "🛡️ SafeLocker: Pre-Reset Encrypted Vault Backup (.bak)"
              : "🛡️ SafeLocker: Encrypted Vault Backup File (.bak)",
            htmlContent,
            attachment: [{ content: base64Backup, name: fileName }],
          }),
        });

        if (!brevoRes.ok) throw new Error(`Backup Dispatch Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // ============================================================================
    // 🌪️ ROUTE 4: SEND PRE-WIPE BACKUP (/send-wipe-backup)
    // ============================================================================
    if (url.pathname === "/send-wipe-backup" && request.method === "POST") {
      try {
        const { email, backupData, device, time } = await request.json();
        if (!email || !backupData) throw new Error("Missing email or wipe backup payload.");

        const normalizedEmail = String(email).replace(/['"]+/g, "").toLowerCase().trim();
        const base64Backup = cleanBase64(backupData);
        const fileName = `SafeLocker_PreWipe_${Date.now()}.bak`;

        const htmlContent = buildBackupEmailHTML({
          heading: "Emergency Pre-Wipe Vault Snapshot",
          badgeText: "Pre-Wipe Backup",
          accentColor: "#EF4444",
          device: device || "SafeLocker Android",
          extraLabel: "Triggered At",
          extraValue: time ? `${time} IST` : getISTTime(),
          fileName,
          istTime: getISTTime(),
        });

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: "🚨 SafeLocker: Emergency Pre-Wipe Backup (.bak)",
            htmlContent,
            attachment: [{ content: base64Backup, name: fileName }],
          }),
        });

        if (!brevoRes.ok) throw new Error(`Wipe Backup Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // ============================================================================
    // ✅ ROUTE 5: RECOVERY CHANNEL DIAGNOSTIC MAIL (/send-test-mail)
    // ============================================================================
    if (url.pathname === "/send-test-mail" && request.method === "POST") {
      try {
        const { email, templateData = {} } = await request.json();
        if (!email) throw new Error("Email address missing.");

        const normalizedEmail = String(email).replace(/['"]+/g, "").toLowerCase().trim();
        const heading = templateData.heading || "Recovery Channel Verified";
        const bodyText = (templateData.body || "Your SafeLocker recovery email channel is active and ready to receive OTPs and encrypted backups.").replace(/\n\n/g, "<br><br>");
        const statusBadge = templateData.statusBadge || "Recovery Email Active & Verified";
        const contextText = (templateData.context || `Verified Time: ${getISTTime()}`).replace(/\n/g, "<br>");

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 28px 14px;">
            <tr>
              <td align="center">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);">
                  <tr><td height="6" style="background: linear-gradient(90deg, #10B981, #059669); background-color: #10B981;"></td></tr>
                  <tr>
                    <td style="padding: 28px 28px 0 28px;">
                      <table width="100%" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="left">
                            <span style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 12px; font-weight: 900; letter-spacing: 0.8px; padding: 6px 12px; border-radius: 8px;">
                              🔒 SAFELOCKER <span style="color: #10B981;">v3.0</span>
                            </span>
                          </td>
                          <td align="right">
                            <span style="display: inline-block; background-color: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-size: 11px; font-weight: 800; padding: 5px 11px; border-radius: 999px; text-transform: uppercase;">
                              Channel Verified
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 26px 28px 32px 28px; text-align: left;">
                      <h1 style="color: #0F172A; font-size: 22px; font-weight: 900; margin: 0 0 12px 0; text-align: center;">${heading}</h1>
                      <p style="color: #475569; font-size: 14.5px; margin: 0 0 20px 0; line-height: 22px; text-align: center;">${bodyText}</p>
                      <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 14px 16px; margin-bottom: 22px; border-radius: 0 12px 12px 0;">
                        <p style="color: #065F46; font-size: 14px; font-weight: 800; margin: 0;">✓ ${statusBadge}</p>
                      </div>
                      <div style="background-color: #F8FAFC; border-radius: 16px; padding: 16px 18px; border: 1px solid #E2E8F0;">
                        <p style="margin: 0 0 8px 0; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Diagnostic Trail</p>
                        <p style="font-size: 12.5px; color: #64748B; font-weight: 600; margin: 0; line-height: 20px;">${contextText}</p>
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="text-align: center; font-size: 12px; color: #64748B; font-weight: 700; margin-top: 20px;">
                  SafeLocker v3.0 Security Engine • Automated Dispatch
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>`;

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "SafeLocker Security", email: env.SENDER_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: templateData.subject || "✅ SafeLocker v3.0: Recovery Email Verified",
            htmlContent,
          }),
        });

        if (!brevoRes.ok) throw new Error(`Test Mail Error: ${await brevoRes.text()}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: false, message: "SafeLocker Worker: Route Not Found" }),
      { status: 404, headers: corsHeaders }
    );
  },
};
