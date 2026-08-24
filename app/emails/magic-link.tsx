import { Text } from "@react-email/components";
import { ActionButton, EmailLayout, MailLink, styles } from "./shared";
import type { EmailTemplateData } from "./types";

type Props = Extract<EmailTemplateData, { template: "magic-link" }>;

export function MagicLinkEmail({
  handle = "reader",
  url = "https://example.com/auth/verify?token=preview-token",
  siteUrl = "https://example.com",
  siteName = "Fikra",
}: Props) {
  return (
    <EmailLayout preview={`Your private sign-in link expires in 15 minutes.`} siteUrl={siteUrl} siteName={siteName}>
      <Text style={styles.eyebrow}>Private sign-in</Text>
      <h1 style={styles.heading}>One click back in.</h1>
      <Text style={styles.paragraph}>Hey @{handle}, your private link to {siteName} is ready.</Text>
      <ActionButton href={url}>Continue as @{handle}</ActionButton>
      <Text style={{ ...styles.mutedParagraph, marginTop: "22px" }}>This link expires in 15 minutes and works once. If you did not request it, you can safely ignore this email.</Text>
      <Text style={styles.mutedParagraph}>Button not working? Copy this link into your browser: <MailLink href={url}>{url}</MailLink></Text>
    </EmailLayout>
  );
}

export default MagicLinkEmail;

MagicLinkEmail.PreviewProps = {
  template: "magic-link",
  handle: "reader",
  url: "https://example.com/auth/verify?token=preview-token",
  siteUrl: "https://example.com",
  siteName: "Fikra",
} satisfies Props;
