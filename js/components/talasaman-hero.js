// The hero image from the talasaman.is front page ("Eitt samtal getur
// breytt öllu."), taken apart: eleven speech bubbles of different kinds that
// overlap into one, and five lines of white lettering on top. The SVG is
// kept as it is on the site, in assets/talasaman-hero.svg.

const HERO_URL = new URL('../../assets/talasaman-hero.svg', import.meta.url);

/** The bubbles, in the order the site pops them in. */
export const BUBBLE_NAMES = [
  'Starburst',
  'Box',
  'Round',
  'Pill',
  'Pill, second',
  'Cloud, large',
  'Cloud, small',
  'Jagged',
  'Jagged, mirrored',
  'Cloud with tail',
  'Round, tail left',
];

let loading = null;

/**
 * Load and take apart the hero (once; later calls share the result).
 * @returns {Promise<{ viewBox: string, label: string, bubbles: Array<{ d: string, name: string }>, lines: SVGGElement[] }>}
 */
export function loadHero() {
  loading ??= fetch(HERO_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load the talasaman.is image (${r.status})`);
      return r.text();
    })
    .then((text) => {
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      return {
        viewBox: svg.getAttribute('viewBox'),
        label: svg.getAttribute('aria-label'),
        bubbles: [...svg.querySelectorAll('.hero-bubble')].map((p, i) => ({ d: p.getAttribute('d'), name: BUBBLE_NAMES[i] })),
        lines: [...svg.querySelectorAll('.hero-line')],
      };
    });
  return loading;
}
