import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";

export default function EmojiKeyboardClient({ onSelect }: { onSelect: (emoji: string) => void }) {
  return <EmojiPicker width="100%" height={410} theme={Theme.AUTO} emojiStyle={EmojiStyle.NATIVE} lazyLoadEmojis autoFocusSearch searchPlaceHolder="Search emoji" previewConfig={{ showPreview: false }} onEmojiClick={(emoji: EmojiClickData) => onSelect(emoji.emoji)} />;
}
