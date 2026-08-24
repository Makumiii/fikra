import { SealCheck, Shuffle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { BANNER_GROUPS, BANNER_STYLE_LABELS, bannerPreviewUrl, type BannerStyle } from "../lib/banner";

const OPTION_COUNT = 6;

function createSeeds() {
  return Array.from({ length: OPTION_COUNT }, () => `bn_${crypto.randomUUID().replaceAll("-", "")}`);
}

export function BannerPicker({ selectedSeed, selectedStyle = "shapes", onSelect }: {
  selectedSeed: string | null;
  selectedStyle?: BannerStyle;
  onSelect: (style: BannerStyle, seed: string) => void;
}) {
  const [styleOverride, setStyleOverride] = useState<BannerStyle | null>(null);
  const activeStyle = styleOverride || selectedStyle;
  const [seeds, setSeeds] = useState<string[]>([]);

  function seedsFor(style: BannerStyle) {
    const current = selectedStyle === style && selectedSeed ? [selectedSeed] : [];
    return [...current, ...createSeeds()].slice(0, OPTION_COUNT);
  }

  useEffect(() => {
    setSeeds(seedsFor(selectedStyle));
    setStyleOverride(null);
    // The selection is initialized from server data and refreshed when a parent resets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStyle]);

  function chooseStyle(style: BannerStyle) {
    setStyleOverride(style);
    setSeeds(seedsFor(style));
  }

  function shuffle() {
    setSeeds(seedsFor(activeStyle));
  }

  const selectedInView = activeStyle === selectedStyle ? selectedSeed : null;

  return <section className="banner-picker" aria-labelledby="banner-picker-heading">
    <div className="banner-picker-heading">
      <div><h2 id="banner-picker-heading">Or choose a DiceBear banner</h2><p>Pick a pack, then choose a pattern. You can change it anytime.</p></div>
      <button type="button" className="soft-button avatar-shuffle" onClick={shuffle} disabled={!seeds.length}><Shuffle size={17} />Shuffle</button>
    </div>
    <div className="banner-style-tabs" role="tablist" aria-label="Banner collections">
      {BANNER_GROUPS.map((group) => <button key={group.id} type="button" role="tab" aria-selected={group.id === activeStyle} className={`banner-style-tab${group.id === activeStyle ? " active" : ""}`} onClick={() => chooseStyle(group.id)}>{group.label}</button>)}
    </div>
    <div className="banner-picker-heading compact"><div><strong>{BANNER_STYLE_LABELS[activeStyle]}</strong><span>{BANNER_GROUPS.find((group) => group.id === activeStyle)?.description}</span></div></div>
    <div className="banner-picker-grid" role="radiogroup" aria-label={`${BANNER_STYLE_LABELS[activeStyle]} banners`}>
      {seeds.length ? seeds.map((seed, index) => <button type="button" role="radio" aria-checked={selectedInView === seed} className={`banner-choice${selectedInView === seed ? " selected" : ""}`} key={`${activeStyle}:${seed}`} onClick={() => onSelect(activeStyle, seed)} aria-label={`${BANNER_STYLE_LABELS[activeStyle]} banner ${index + 1}${selectedInView === seed ? ", selected" : ""}`}><img src={bannerPreviewUrl(activeStyle, seed)} alt="" loading="lazy" />{selectedInView === seed ? <span className="banner-choice-check"><SealCheck size={18} weight="fill" /></span> : null}</button>) : Array.from({ length: OPTION_COUNT }, (_, index) => <span className="banner-choice-skeleton" key={index} aria-hidden="true" />)}
    </div>
    {selectedSeed ? <p className="avatar-picker-selection" role="status">Banner selected. Save profile to keep it.</p> : <p className="avatar-picker-selection muted" role="status">No generated banner selected. Your uploaded banner stays unchanged.</p>}
  </section>;
}
