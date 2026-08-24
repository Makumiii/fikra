import { Section, Text } from "@react-email/components";
import { ActionButton, Avatar, EmailLayout, PostContent, styles } from "./shared";
import type { EmailTemplateData } from "./types";

type Props = Extract<EmailTemplateData, { template: "activity" }>;

export function ActivityEmail({
  activity = "reply",
  actorName = "Site Owner",
  actorHandle = "owner",
  actorAvatarUrl,
  quote = "This is a reply that keeps the conversation moving.",
  url = "https://example.com/",
  siteUrl = "https://example.com",
  siteName = "Fikra",
}: Props) {
  const isMention = activity === "mention";
  return (
    <EmailLayout preview={isMention ? `@${actorHandle} mentioned you.` : `@${actorHandle} replied to you.`} siteUrl={siteUrl} siteName={siteName} footer="settings" settingsUrl={`${siteUrl}/settings`}>
      <Text style={styles.eyebrow}>{isMention ? "You were mentioned" : "New reply"}</Text>
      <Section style={{ alignItems: "center", display: "flex", gap: "12px", marginBottom: "18px" }}>
        <Avatar name={actorName} src={actorAvatarUrl} />
        <Text style={{ color: styles.paragraph.color, fontSize: "14px", lineHeight: "1.3", margin: 0 }}><strong>{actorName}</strong><br /><span style={{ color: styles.mutedParagraph.color }}>@{actorHandle}</span></Text>
      </Section>
      <h1 style={styles.headingSmall}>{isMention ? "Someone called your handle." : "Someone continued the conversation."}</h1>
      <Section style={styles.postCard}><PostContent body={quote} limit={1000} /></Section>
      <ActionButton href={url}>{isMention ? "See the mention" : "Open the reply"}</ActionButton>
      <Text style={{ ...styles.mutedParagraph, marginTop: "22px", marginBottom: 0 }}>You can adjust reply and mention notifications from <a href={`${siteUrl}/settings`} style={styles.secondaryLink}>settings</a>.</Text>
    </EmailLayout>
  );
}

export default ActivityEmail;

ActivityEmail.PreviewProps = {
  template: "activity",
  activity: "reply",
  actorName: "Site Owner",
  actorHandle: "owner",
  quote: "This is a reply that keeps the conversation moving.",
  url: "https://example.com/post/example-id#reply-preview",
  siteUrl: "https://example.com",
  siteName: "Fikra",
} satisfies Props;
