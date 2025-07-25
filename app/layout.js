import { Inter } from "next/font/google";
import "./globals.css";
import { Briefcase, FileText, Image as ImageIcon, Github, Link as LinkIcon } from 'lucide-react';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Convert That Image | Build That Thing",
  description: "A powerful, client-side image converter for the Build That Thing suite of tools.",
};

// --- Shared Header Component ---
function SiteHeader() {
  return (
    <header className="w-full bg-white/50 backdrop-blur-lg border-b border-slate-200/80 sticky top-0 z-10">
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

// --- Improved Footer Component ---
function SiteFooter() {
    return (
        <footer className="bg-white/50 border-t border-slate-200/80 mt-12 py-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                    {/* Left Column: Branding and Links */}
                    <div className="text-center md:text-left">
                        <p className="text-base font-bold text-slate-800">Build That Thing</p>
                        <p className="mt-2 text-slate-500">
                            A suite of powerful, client-side tools to help you build and create.
                        </p>
                        <div className="flex justify-center md:justify-start gap-6 mt-4">
                            <a href="https://oliverrevelo.vercel.app" target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 hover:text-indigo-600 transition-colors">Portfolio</a>
                            <a href="https://github.com/oancholarevelo" target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 hover:text-indigo-600 transition-colors">GitHub</a>
                        </div>
                        <p className="mt-4 text-xs text-slate-400">
                            &copy; {new Date().getFullYear()} Oliver Revelo. All Rights Reserved.
                        </p>
                    </div>

                    {/* Right Column: Navigation Links */}
                    <div className="flex flex-col items-center md:items-end">
                        <h3 className="font-semibold text-slate-800">Navigate</h3>
                        <ul className="mt-2 space-y-1 text-center md:text-right">
                            <li><a href="https://buildthatthing.vercel.app/" className="text-slate-500 hover:text-indigo-600 transition-colors">Build That Thing Home</a></li>
                            <li><a href="https://buildthatinvoice.vercel.app/" className="text-slate-500 hover:text-indigo-600 transition-colors">Invoice Builder</a></li>
                            <li><a href="https://buildthatresume.vercel.app/" className="text-slate-500 hover:text-indigo-600 transition-colors">Resume Builder</a></li>
                            <li><a href="https://converthatimage.vercel.app/" className="text-slate-500 hover:text-indigo-600 transition-colors">Image Converter</a></li>
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50`}>
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