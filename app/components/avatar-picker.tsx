import { Shuffle, SealCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AVATAR_GROUPS, AVATAR_STYLE_LABELS, avatarPreviewUrl, type AvatarStyle } from "../lib/avatar";

const OPTION_COUNT = 8;

function createSeeds() {
  return Array.from({ length: OPTION_COUNT }, () => `av_${crypto.randomUUID().replaceAll("-", "")}`);
}

export function AvatarPicker({
  selectedSeed,
  selectedStyle = "voxel-bot",
  onSelect,
  label = "Choose your avatar",
  required = false,
  includeHiddenFields = true,
}: {
  selectedSeed: string | null;
  selectedStyle?: AvatarStyle;
  onSelect: (style: AvatarStyle, seed: string) => void;
  label?: string;
  required?: boolean;
  includeHiddenFields?: boolean;
}) {
  const [styleOverride, setStyleOverride] = useState<AvatarStyle | null>(null);
  const activeStyle = styleOverride || selectedStyle;
  const activeGroup = AVATAR_GROUPS.find((group) => group.styles.some((style) => style.id === activeStyle)) || AVATAR_GROUPS[0];
  const selectedStyleInGroup = activeGroup.styles.some((style) => style.id === activeStyle);
  const visibleStyles = selectedStyleInGroup ? activeGroup.styles : [activeGroup.styles[0]];
  const [seeds, setSeeds] = useState<string[]>([]);

  function seedsFor(style: AvatarStyle) {
    const current = selectedStyle === style && selectedSeed ? [selectedSeed] : [];
    return [...current, ...createSeeds()].slice(0, OPTION_COUNT);
  }

  useEffect(() => {
    setSeeds(seedsFor(selectedStyle));
    setStyleOverride(null);
    // The selection is initialized from server data and refreshed when a parent resets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStyle]);

  function chooseGroup(groupId: string) {
    const group = AVATAR_GROUPS.find((item) => item.id === groupId);
    if (!group) return;
    const nextStyle = group.styles[0].id;
    setStyleOverride(nextStyle);
    setSeeds(seedsFor(nextStyle));
  }

  function chooseStyle(style: AvatarStyle) {
    setStyleOverride(style);
    setSeeds(seedsFor(style));
  }

  function shuffle() {
    setSeeds(seedsFor(activeStyle));
  }

  const selectedInView = activeStyle === selectedStyle ? selectedSeed : null;
  const activeStyleInfo = visibleStyles.find((style) => style.id === activeStyle) || visibleStyles[0];
  const panelId = `avatar-group-${activeGroup.id}`;

  return <section className="avatar-picker" aria-labelledby="avatar-picker-heading">
    <div className="avatar-picker-heading">
      <div><h2 id="avatar-picker-heading">{label}</h2><p>{required ? "New subscribers choose one. Returning subscribers keep theirs." : "Pick a style, then choose a face. You can change it anytime in Settings."}</p></div>
      <button type="button" className="soft-button avatar-shuffle" onClick={shuffle} disabled={!seeds.length}><Shuffle size={17} />Shuffle</button>
    </div>

    <div className="avatar-group-tabs" role="tablist" aria-label="Avatar collections">
      {AVATAR_GROUPS.map((group) => <button key={group.id} type="button" role="tab" aria-selected={group.id === activeGroup.id} aria-controls={`avatar-group-${group.id}`} className={`avatar-group-tab${group.id === activeGroup.id ? " active" : ""}`} onClick={() => chooseGroup(group.id)}>{group.label}</button>)}
    </div>

    <div id={panelId} className="avatar-picker-panel" role="tabpanel" aria-label={`${activeGroup.label} avatars`}>
      <div className="avatar-style-heading"><div><strong>{activeStyleInfo.label}</strong><span>{activeStyleInfo.description}</span></div>{visibleStyles.length > 1 ? <div className="avatar-style-options" role="tablist" aria-label={`${activeGroup.label} styles`}>{visibleStyles.map((style) => <button key={style.id} type="button" role="tab" aria-selected={style.id === activeStyle} className={`avatar-style-option${style.id === activeStyle ? " active" : ""}`} onClick={() => chooseStyle(style.id)}>{style.label}</button>)}</div> : null}</div>
      <div className="avatar-picker-grid" role="radiogroup" aria-label={`${AVATAR_STYLE_LABELS[activeStyle]} avatars`}>
        {seeds.length ? seeds.map((seed, index) => <button type="button" role="radio" aria-checked={selectedInView === seed} className={`avatar-choice${selectedInView === seed ? " selected" : ""}`} key={`${activeStyle}:${seed}`} onClick={() => onSelect(activeStyle, seed)} aria-label={`${AVATAR_STYLE_LABELS[activeStyle]} avatar ${index + 1}${selectedInView === seed ? ", selected" : ""}`}><img src={avatarPreviewUrl(activeStyle, seed)} alt="" loading="lazy" />{selectedInView === seed ? <span className="avatar-choice-check"><SealCheck size={18} weight="fill" /></span> : null}</button>) : Array.from({ length: OPTION_COUNT }, (_, index) => <span className="avatar-choice-skeleton" key={index} aria-hidden="true" />)}
      </div>
    </div>

    {selectedSeed ? <p className="avatar-picker-selection" role="status">Avatar selected. You can change it anytime in Settings.</p> : <p className="avatar-picker-selection muted" role="status">{required ? "New here? Choose one. Returning subscribers can continue without changing theirs." : "No avatar selected. Your initial will be used."}</p>}
    {includeHiddenFields ? <><input type="hidden" name="avatarSeed" value={selectedSeed || ""} /><input type="hidden" name="avatarStyle" value={activeStyle} /></> : null}
  </section>;
}
