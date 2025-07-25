import { Inter } from "next/font/google";
import "./globals.css";

// Initialize the Inter font, specifying the 'latin' subset.
const inter = Inter({ subsets: ["latin"] });

// Define the metadata for the application.
// This will be used for SEO and the browser tab title.
export const metadata = {
  title: "Optimized WebP Converter",
  description: "A fast, client-side image to WebP converter built with Next.js and Web Workers.",
};
/**
 * RootLayout is the main layout component that wraps around all pages.
 * @param {object} props - The properties for the component.
 * @param {React.ReactNode} props.children - The child components (the actual pages) to be rendered inside the layout.
 * @returns {JSX.Element} The root layout of the application.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* Apply the Inter font class to the body.
        The `children` prop here will be your `page.js` component.
      */}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
