import { Inter } from "next/font/google";
import "./globals.css";
import { Briefcase, FileText, Image as ImageIcon } from 'lucide-react';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Convert That Image | Build That Thing",
  description: "A powerful, client-side image converter for the Build That Thing suite of tools.",
};

// --- Shared Header Component ---
function SiteHeader() {
  return (
    <header className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-4 flex justify-between items-center">
        <a href="#" className="text-xl font-bold text-slate-800">
          Build That Thing
        </a>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-slate-600">
          <a href="https://buildthatinvoice.vercel.app/" className="flex items-center gap-2 hover:text-indigo-600 transition-colors">
            <FileText size={16} />
            <span className="hidden sm:inline">Invoice</span>
          </a>
          <a href="https://buildthatresume.vercel.app/" className="flex items-center gap-2 hover:text-indigo-600 transition-colors">
            <Briefcase size={16} />
            <span className="hidden sm:inline">Resume</span>
          </a>
          <a href="https://converthatimage.vercel.app/" className="flex items-center gap-2 text-indigo-600 font-semibold">
            <ImageIcon size={16} />
            <span className="hidden sm:inline">Image</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

// --- Shared Footer Component ---
function SiteFooter() {
    return (
        <footer className="text-center py-10">
            <p className="text-sm text-slate-500">
                Part of the <a href="https://buildthatthing.vercel.app/" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline">Build That Thing</a> suite. <br />Developed by <a href="https://oliverrevelo.vercel.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline">Oliver Revelo</a>.
            </p>
        </footer>
    );
}


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-100`}>
        <div className="flex flex-col min-h-screen">
          <SiteHeader />
          <main className="flex-grow">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
