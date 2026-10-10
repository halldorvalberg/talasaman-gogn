// Tiny helpers for building HTML and SVG without a framework.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an HTML element.
 * @param {string} tag
 * @param {object} [props] set as element properties (className, href, hidden, ariaLabel…)
 * @param {...(Node|string)} children
 */
export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Create an SVG element.
 * @param {string} tag
 * @param {object} [attrs] set as attributes (SVG has few reflected properties)
 * @param {...Node} children
 */
export function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** Re-add a class so its CSS animation plays again from the start. */
export function replayClass(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // force a style flush between remove and add
  node.classList.add(className);
}

/** Remove a class from every matching element inside `root`. */
export function removeClassWithin(root, className) {
  for (const node of root.querySelectorAll(`.${className}`)) node.classList.remove(className);
}
