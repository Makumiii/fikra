import { connect } from "cloudflare:sockets";

class SmtpConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(public socket: ReturnType<typeof connect>) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  release() { this.reader.releaseLock(); this.writer.releaseLock(); }
  async write(value: string) { await this.writer.write(new TextEncoder().encode(value)); }
  async command(value: string, expected: number[]) {
    await this.write(`${value}\r\n`);
    return this.response(expected);
  }
  async response(expected: number[]) {
    for (;;) {
      const lines = this.buffer.split("\n");
      for (let index = 0; index < lines.length - 1; index++) {
        const line = lines[index].replace(/\r$/, "");
        const match = line.match(/^(\d{3}) (.*)$/);
        if (match) {
          this.buffer = lines.slice(index + 1).join("\n");
          const code = Number(match[1]);
          if (!expected.includes(code)) throw new Error(`SMTP rejected command (${code}): ${match[2]}`);
          return line;
        }
      }
      const chunk = await this.reader.read();
      if (chunk.done) throw new Error("SMTP connection closed unexpectedly");
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }
  async close() {
    try { await this.command("QUIT", [221]); } catch { /* connection may already be closed */ }
    await this.writer.close().catch(() => undefined);
  }
}

function cleanHeader(value: string) { return value.replace(/[\r\n]/g, " ").trim(); }
function encodeBase64(value: string) { return btoa(String.fromCharCode(...new TextEncoder().encode(value))); }
function encodeHeader(value: string) {
  const cleaned = cleanHeader(value);
  return /^[\x20-\x7e]*$/.test(cleaned) ? cleaned : `=?UTF-8?B?${encodeBase64(cleaned)}?=`;
}

export async function sendSmtp(env: Env, message: { to: string; subject: string; text: string; html: string; unsubscribeUrl?: string }) {
  const host = env.SMTP_HOST;
  const username = env.SMTP_USERNAME;
  const password = env.SMTP_PASSWORD;
  const fromEmail = env.SMTP_FROM_EMAIL;
  if (!host || !username || !password || !fromEmail) throw new Error("SMTP secrets are not configured");
  const port = Number(env.SMTP_PORT || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is invalid");

  const plainSocket = connect({ hostname: host, port }, { secureTransport: "starttls", allowHalfOpen: false });
  const plain = new SmtpConnection(plainSocket);
  await plain.response([220]);
  await plain.command(`EHLO ${new URL(env.SITE_URL).hostname}`, [250]);
  await plain.command("STARTTLS", [220]);
  plain.release();

  const tls = new SmtpConnection(plainSocket.startTls());
  await tls.command(`EHLO ${new URL(env.SITE_URL).hostname}`, [250]);
  await tls.command("AUTH LOGIN", [334]);
  await tls.command(encodeBase64(username), [334]);
  await tls.command(encodeBase64(password), [235]);
  await tls.command(`MAIL FROM:<${cleanHeader(fromEmail)}>`, [250]);
  await tls.command(`RCPT TO:<${cleanHeader(message.to)}>`, [250, 251]);
  await tls.command("DATA", [354]);

  const boundary = `fikra-${crypto.randomUUID()}`;
  const fromName = cleanHeader(env.SMTP_FROM_NAME || env.SITE_NAME);
  const body = [
    `From: ${encodeHeader(fromName)} <${cleanHeader(fromEmail)}>`, `To: <${cleanHeader(message.to)}>`,
    `Subject: ${encodeHeader(message.subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${new URL(env.SITE_URL).hostname}>`, "MIME-Version: 1.0",
    ...(message.unsubscribeUrl ? [`List-Unsubscribe: <${cleanHeader(message.unsubscribeUrl)}>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click"] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", message.text,
    `--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", message.html,
    `--${boundary}--`, "",
  ].join("\r\n").replace(/^\./gm, "..");
  await tls.write(`${body}\r\n.\r\n`);
  await tls.response([250]);
  await tls.close();
}
