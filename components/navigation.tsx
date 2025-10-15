"use client";

import { Button } from "@/components/ui/button";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <div className="flex items-center gap-1 sm:gap-2 text-[#4ADE80] font-medium text-sm sm:text-base">
            <span>aicorelab</span>
            <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>dev</span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            <a
              href="#services"
              className="text-gray-700 hover:text-[#0B3D2E] transition-colors text-sm lg:text-base"
            >
              Services
            </a>
            <a
              href="#process"
              className="text-gray-700 hover:text-[#0B3D2E] transition-colors text-sm lg:text-base"
            >
              Process
            </a>
            <a
              href="#showcase"
              className="text-gray-700 hover:text-[#0B3D2E] transition-colors text-sm lg:text-base"
            >
              Showcase
            </a>
            <a
              href="/page2"
              className="text-gray-700 hover:text-[#0B3D2E] transition-colors text-sm lg:text-base"
            >
              Page 2
            </a>
            <a
              href="#contact"
              className="text-gray-700 hover:text-[#0B3D2E] transition-colors text-sm lg:text-base"
            >
              Contact
            </a>
          </div>

          {/* Desktop CTA Button */}
          <Button
            size="sm"
            className="hidden md:flex bg-[#0B3D2E] hover:bg-[#145C43] text-white px-4 lg:px-6 py-2 rounded-xl transition-all duration-300 text-sm"
          >
            Start Project
          </Button>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen
              ? <X className="w-6 h-6" />
              : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100 space-y-3">
            <a
              href="#services"
              className="block py-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Services
            </a>
            <a
              href="#process"
              className="block py-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Process
            </a>
            <a
              href="#showcase"
              className="block py-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Showcase
            </a>
            <a
              href="/page2"
              className="block py-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Page 2
            </a>
            <a
              href="#contact"
              className="block py-2 text-gray-700 hover:text-[#0B3D2E] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contact
            </a>
            <Button
              size="sm"
              className="w-full bg-[#0B3D2E] hover:bg-[#145C43] text-white px-6 py-2 rounded-xl transition-all duration-300 mt-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Start Project
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
