import { Section, Text } from "@react-email/components";
import { ActionButton, Avatar, EmailLayout, MailLink, styles } from "./shared";
import type { EmailTemplateData } from "./types";

type Props = Extract<EmailTemplateData, { template: "welcome" }>;

export function WelcomeEmail({
  handle = "reader",
  timelineUrl = "https://example.com/",
  settingsUrl = "https://example.com/settings",
  siteUrl = "https://example.com",
  siteName = "Fikra",
  avatarUrl,
}: Props) {
  return (
    <EmailLayout preview={`You are in, @${handle}.`} siteUrl={siteUrl} siteName={siteName} footer="settings" settingsUrl={settingsUrl}>
      <Section style={{ alignItems: "center", display: "flex", gap: "12px", marginBottom: "20px" }}>
        <Avatar name={handle} src={avatarUrl} />
        <Text style={{ color: styles.paragraph.color, fontSize: "14px", fontWeight: 700, margin: 0 }}>@{handle}</Text>
      </Section>
      <Text style={styles.eyebrow}>You&apos;re in</Text>
      <h1 style={styles.heading}>Welcome to the timeline.</h1>
      <Text style={styles.paragraph}>Reading is public. Your handle is what lets you reply, react, bookmark, and join the conversation.</Text>
      <ActionButton href={timelineUrl}>Open the timeline</ActionButton>
      <Text style={{ ...styles.mutedParagraph, marginTop: "22px" }}>A small corner of the internet, independently hosted and occasionally unserious.</Text>
      <Text style={styles.mutedParagraph}>You can tune your post and reply notifications any time from <MailLink href={settingsUrl}>notification settings</MailLink>.</Text>
    </EmailLayout>
  );
}

export default WelcomeEmail;

WelcomeEmail.PreviewProps = {
  template: "welcome",
  handle: "reader",
  timelineUrl: "https://example.com/",
  settingsUrl: "https://example.com/settings",
  siteUrl: "https://example.com",
  siteName: "Fikra",
} satisfies Props;
