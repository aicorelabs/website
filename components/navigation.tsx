"use client"

import { Button } from "@/components/ui/button"
import { ArrowUpRight } from "lucide-react"

export function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 text-[#4ADE80] font-medium">
            <span>aicore</span>
            <ArrowUpRight className="w-4 h-4" />
            <span>studio</span>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#services" className="text-gray-700 hover:text-[#0B3D2E] transition-colors">
              Services
            </a>
            <a href="#process" className="text-gray-700 hover:text-[#0B3D2E] transition-colors">
              Process
            </a>
            <a href="#showcase" className="text-gray-700 hover:text-[#0B3D2E] transition-colors">
              Showcase
            </a>
            <a href="#contact" className="text-gray-700 hover:text-[#0B3D2E] transition-colors">
              Contact
            </a>
          </div>

          {/* CTA Button */}
          <Button
            size="sm"
            className="bg-[#0B3D2E] hover:bg-[#145C43] text-white px-6 py-2 rounded-xl transition-all duration-300"
          >
            Start Project
          </Button>
        </div>
      </div>
    </nav>
  )
}
