import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const colors = {
  page: "#f7f7f4",
  surface: "#ffffff",
  soft: "#f0f1ed",
  ink: "#131516",
  muted: "#626a6f",
  faint: "#687076",
  line: "#dedfda",
  accent: "#4f63d8",
  accentSoft: "#edf0ff",
};

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const displayFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

export const styles = {
  body: { backgroundColor: colors.page, color: colors.ink, fontFamily: font, margin: 0, padding: "28px 12px" },
  container: { margin: "0 auto", maxWidth: "600px", width: "100%" },
  header: { padding: "4px 4px 18px" },
  brand: { color: colors.ink, fontFamily: displayFont, fontSize: "17px", fontWeight: 800, letterSpacing: "-0.03em", margin: 0 },
  tagline: { color: colors.muted, fontSize: "11px", margin: "4px 0 0" },
  card: { backgroundColor: colors.surface, border: `1px solid ${colors.line}`, borderRadius: "18px", padding: "32px 30px" },
  eyebrow: { color: colors.accent, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 12px", textTransform: "uppercase" as const },
  heading: { color: colors.ink, fontFamily: displayFont, fontSize: "30px", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: "1.05", margin: "0 0 14px" },
  headingSmall: { color: colors.ink, fontFamily: displayFont, fontSize: "23px", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: "1.1", margin: "0 0 10px" },
  paragraph: { color: colors.ink, fontSize: "15px", lineHeight: "1.55", margin: "0 0 16px" },
  mutedParagraph: { color: colors.muted, fontSize: "13px", lineHeight: "1.55", margin: "0 0 16px" },
  button: { backgroundColor: colors.ink, borderRadius: "999px", color: colors.page, display: "inline-block", fontSize: "14px", fontWeight: 750, lineHeight: "1", padding: "14px 20px", textDecoration: "none" },
  secondaryLink: { color: colors.accent, fontSize: "13px", fontWeight: 700, textDecoration: "underline" },
  divider: { borderColor: colors.line, margin: "24px 0" },
  footer: { padding: "18px 4px 0" },
  footerText: { color: colors.faint, fontSize: "11px", lineHeight: "1.5", margin: "0 0 5px" },
  postCard: { backgroundColor: colors.soft, borderRadius: "14px", margin: "20px 0", padding: "18px" },
  postLabel: { color: colors.accent, fontSize: "10px", fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 8px", textTransform: "uppercase" as const },
  postBody: { color: colors.ink, fontSize: "15px", lineHeight: "1.5", margin: "0" },
  postTitle: { color: colors.ink, fontFamily: displayFont, fontSize: "21px", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: "1.15", margin: "0 0 8px" },
  postExcerpt: { color: colors.muted, fontSize: "13px", lineHeight: "1.45", margin: "0" },
  topic: { color: colors.accent, fontSize: "11px", fontWeight: 700, margin: "10px 0 0" },
};

export function EmailLayout({
  children,
  preview,
  siteUrl = "https://example.com",
  siteName = "Fikra",
  footer = "none",
  unsubscribeUrl,
  settingsUrl,
}: {
  children: ReactNode;
  preview: string;
  siteUrl: string;
  siteName?: string;
  footer?: "none" | "unsubscribe" | "settings";
  unsubscribeUrl?: string;
  settingsUrl?: string;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{siteName}</Text>
            <Text style={styles.tagline}>A small, independently hosted timeline.</Text>
          </Section>
          <Section style={styles.card}>{children}</Section>
          {footer !== "none" ? (
            <Section style={styles.footer}>
              <Hr style={{ ...styles.divider, margin: "0 0 14px" }} />
              <Text style={styles.footerText}>You are receiving this because you joined {siteName}.</Text>
              {footer === "unsubscribe" && unsubscribeUrl ? (
                <Text style={styles.footerText}><Link href={unsubscribeUrl} style={styles.secondaryLink}>Unsubscribe from post emails</Link></Text>
              ) : null}
              {footer === "settings" && settingsUrl ? (
                <Text style={styles.footerText}><Link href={settingsUrl} style={styles.secondaryLink}>Manage notification settings</Link></Text>
              ) : null}
              <Text style={styles.footerText}><Link href={siteUrl} style={styles.secondaryLink}>Open the timeline</Link></Text>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export function ActionButton({ href, children }: { href: string; children: ReactNode }) {
  return <Button href={href} style={styles.button}>{children}</Button>;
}

export function Avatar({ name = "Site Owner", src }: { name?: string; src?: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "F";
  const showImage = Boolean(src && /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(src));
  return showImage ? (
    <Img src={src} width="42" height="42" alt={`${name} avatar`} style={{ borderRadius: "50%", display: "block", height: "42px", objectFit: "cover", width: "42px" }} />
  ) : (
    <Section style={{ backgroundColor: colors.ink, borderRadius: "50%", color: colors.page, height: "42px", textAlign: "center", verticalAlign: "middle", width: "42px" }}>
      <Text style={{ color: colors.page, fontFamily: displayFont, fontSize: "17px", fontWeight: 800, lineHeight: "42px", margin: 0 }}>{initial}</Text>
    </Section>
  );
}

export function Topics({ topics }: { topics?: string[] }) {
  if (!topics?.length) return null;
  return <Text style={styles.topic}>{topics.slice(0, 8).map((topic) => `#${topic.replace(/^#/, "")}`).join("  ·  ")}</Text>;
}

export function PostContent({ body, limit = 1500 }: { body: string; limit?: number }) {
  const clipped = body.length > limit ? `${body.slice(0, limit).trimEnd()}…` : body;
  return <Text style={styles.postBody}>{clipped}</Text>;
}

export function PostLabel({ kind }: { kind?: "thought" | "article" | "link" }) {
  return <Text style={styles.postLabel}>{kind === "article" ? "article" : kind === "link" ? "link post" : "thought"}</Text>;
}

export function MailLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} style={styles.secondaryLink}>{children}</Link>;
}
