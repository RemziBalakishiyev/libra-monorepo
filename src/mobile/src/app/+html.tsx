import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web document shell. Keyboard focus gets one brand-coloured ring (`:focus-visible`) instead of the browser's
 * default black box, so focus stays visible and consistent with the design system on every screen.
 */
const documentStyles = `
  :focus { outline: none; }
  :focus-visible { outline: 2px solid #4F5FE7; outline-offset: 2px; border-radius: 8px; }
  @media (prefers-color-scheme: dark) { :focus-visible { outline-color: #8993F5; } }
  input:focus-visible { outline-offset: 4px; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="az">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: documentStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
