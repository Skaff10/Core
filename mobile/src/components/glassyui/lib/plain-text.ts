import { Children, isValidElement, type ReactNode } from 'react';

/**
 * Sets plain text inside a Text, which React Native needs to render it. Content that is all text
 * becomes one Text; beside elements such as icons, each run of text gets its own.
 */
export function wrapPlainText(node: ReactNode, render: (text: ReactNode) => ReactNode) {
  const parts = Children.toArray(node);

  if (parts.length === 0) return null;

  if (parts.every((part) => !isValidElement(part))) return render(node);

  return Children.map(node, (part) => (isValidElement(part) ? part : render(part)));
}

/** The words in `node` when it is only text, to name a control for assistive technology. */
export function plainTextOf(node: ReactNode) {
  const parts = Children.toArray(node);

  return parts.length > 0 && parts.every((part) => !isValidElement(part))
    ? parts.join('')
    : undefined;
}
