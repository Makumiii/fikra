import { Img, Section, Text } from "@react-email/components";
import { ActionButton, EmailLayout, PostContent, PostLabel, Topics, styles } from "./shared";
import type { EmailTemplateData } from "./types";

type Props = Extract<EmailTemplateData, { template: "new-post" }>;

export function NewPostEmail({
  kind = "thought",
  title,
  body = "A short preview of a new timeline post.",
  excerpt,
  url = "https://example.com/",
  coverUrl,
  topics,
  siteUrl = "https://example.com",
  siteName = "Fikra",
  unsubscribeUrl = "https://example.com/unsubscribe?token=preview-token",
}: Props) {
  const isArticle = kind === "article";
  const preview = isArticle ? `New on ${siteName}: ${title || "an article"}` : `A new ${kind === "link" ? "link" : "thought"} is live on ${siteName}.`;
  return (
    <EmailLayout preview={preview} siteUrl={siteUrl} siteName={siteName} footer="unsubscribe" unsubscribeUrl={unsubscribeUrl}>
      <Text style={styles.eyebrow}>New on the timeline</Text>
      {isArticle ? <h1 style={styles.heading}>{title || "A new article"}</h1> : <h1 style={styles.headingSmall}>A new {kind === "link" ? "link" : "thought"} is live.</h1>}
      {coverUrl && isArticle ? <Img src={coverUrl} alt={title ? `Cover image for ${title}` : "Article cover"} width="536" style={{ borderRadius: "12px", display: "block", margin: "20px 0", maxWidth: "100%" }} /> : null}
      <Section style={styles.postCard}>
        <PostLabel kind={kind} />
        {isArticle ? <Text style={styles.postExcerpt}>{excerpt || body.slice(0, 260)}</Text> : <PostContent body={body} />}
        <Topics topics={topics} />
      </Section>
      <ActionButton href={url}>{isArticle ? "Read the article" : "Open the conversation"}</ActionButton>
      <Text style={{ ...styles.mutedParagraph, marginTop: "22px", marginBottom: 0 }}>Be interesting. Be kind. Or at least make a good point.</Text>
    </EmailLayout>
  );
}

export default NewPostEmail;

NewPostEmail.PreviewProps = {
  template: "new-post",
  kind: "article",
  title: "The web is still worth making",
  body: "A short preview of the article body.",
  excerpt: "A practical note on building small, personal corners of the internet.",
  url: "https://example.com/post/example-article",
  topics: ["Building", "Internet"],
  siteUrl: "https://example.com",
  siteName: "Fikra",
  unsubscribeUrl: "https://example.com/unsubscribe?token=preview-token",
} satisfies Props;
