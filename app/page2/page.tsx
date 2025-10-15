import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, Brain, Rocket, Scale, Zap } from "lucide-react";
import { RippleEffect } from "@/components/ripple-effect";
import { CustomCursor } from "@/components/custom-cursor";
import { Navigation } from "@/components/navigation";

export default function Page2() {
    return (
        <div className="min-h-screen bg-white cursor-none">
            <RippleEffect />
            <CustomCursor />
            {/* Navigation Component */}
            <Navigation />

            <main role="main">
                {/* Hero Section - The Offer */}
                <section
                    className="relative min-h-screen flex items-center pt-16"
                    aria-label="Hero section"
                >
                    <div className="container mx-auto px-6">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            {/* Left Side - Bold Promise */}
                            <article className="space-y-12">
                                <header className="space-y-8">
                                    <h1 className="text-7xl font-bold text-[#0B3D2E] font-[family-name:var(--font-space-grotesk)] leading-tight">
                                        Your Idea, Built.
                                        <br />
                                        <span className="text-[#4ADE80]">
                                            A Custom AI-Powered MVP in 10 Days.
                                        </span>
                                    </h1>
                                    <p className="text-2xl text-gray-700 leading-relaxed max-w-xl font-medium">
                                        Stop planning, start proving. We build a
                                        working proof of concept that you can
                                        put in front of real users and investors
                                        in just two weeks.
                                    </p>
                                </header>

                                <Button
                                    size="lg"
                                    className="bg-[#00FFB2] hover:bg-[#4ADE80] text-black font-semibold px-12 py-7 text-xl rounded-2xl glow-effect transition-all duration-300 hover:scale-105 shadow-lg"
                                >
                                    Book Your Build Sprint Call
                                </Button>
                            </article>

                            {/* Right Side - Visual Countdown */}
                            <div className="relative">
                                <div className="aspect-square rounded-3xl overflow-hidden relative shadow-2xl bg-gradient-to-br from-[#0B3D2E] via-[#145C43] to-[#4ADE80]">
                                    <div className="absolute inset-0 flex flex-col justify-center items-center text-white space-y-8 p-12">
                                        <div className="text-center space-y-6">
                                            <div className="text-8xl font-bold drop-shadow-lg">
                                                10
                                            </div>
                                            <h3 className="text-3xl font-bold drop-shadow-lg">
                                                Days to Your MVP
                                            </h3>
                                            <div className="space-y-4 text-xl">
                                                <p className="opacity-90">
                                                    ✓ Real Product
                                                </p>
                                                <p className="opacity-90">
                                                    ✓ Real Users
                                                </p>
                                                <p className="opacity-90">
                                                    ✓ Real Results
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Problem Section - The Valley of Death */}
                <section className="py-24 bg-neutral-50">
                    <div className="container mx-auto px-6">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center space-y-6 mb-16">
                                <h2 className="text-5xl font-bold text-gray-900 leading-tight">
                                    The Six-Month "Idea-to-Product" Gap{" "}
                                    <span className="text-red-600">
                                        Kills Most Businesses.
                                    </span>
                                </h2>
                            </div>

                            <div className="bg-white p-12 rounded-3xl shadow-lg space-y-6 text-lg text-gray-700 leading-relaxed">
                                <p>
                                    The traditional path is slow and expensive.
                                    Months spent on specifications, tens of
                                    thousands paid to development teams, all
                                    while your market moves on. You burn through
                                    your capital before you even have a product
                                    to test.
                                </p>
                                <p className="font-semibold text-xl text-gray-900">
                                    By the time you launch, you might find out
                                    your core assumption was wrong. That's a
                                    fatal error. Speed isn't a feature; it's a
                                    survival strategy.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Solution Section - The Bridge */}
                <section className="py-24 bg-white">
                    <div className="container mx-auto px-6">
                        <div className="max-w-5xl mx-auto space-y-16">
                            <div className="text-center space-y-6">
                                <h2 className="text-5xl font-bold text-gray-900">
                                    We Get You Across the Gap in{" "}
                                    <span className="text-[#4ADE80]">
                                        Two Weeks.
                                    </span>
                                </h2>
                            </div>

                            <div className="space-y-8 text-lg text-gray-700 leading-relaxed">
                                <p className="text-xl">
                                    This isn't a typical project. It's a
                                    focused, high-intensity{" "}
                                    <strong className="text-[#0B3D2E]">
                                        10-day build sprint
                                    </strong>
                                    .
                                </p>

                                <p>
                                    Our senior strategists and AI developers
                                    work directly with you. Days 1-3 are for
                                    locking down the scope of the single most
                                    critical feature. Days 4-10 are for building
                                    it. We cut out the meetings, the middlemen,
                                    and the months of waiting.
                                </p>

                                <p className="text-xl font-semibold text-gray-900">
                                    We don't leave you with a document; we leave
                                    you with a working asset.
                                </p>
                            </div>

                            {/* Process Timeline */}
                            <div className="grid md:grid-cols-2 gap-8 mt-12">
                                <Card className="p-8 bg-[#0B3D2E] text-white">
                                    <CardContent className="space-y-4">
                                        <div className="text-4xl font-bold text-[#4ADE80]">
                                            Days 1-3
                                        </div>
                                        <h3 className="text-2xl font-bold">
                                            Lock Down Scope
                                        </h3>
                                        <p className="text-gray-300 leading-relaxed">
                                            We identify and define the single
                                            most critical feature that will
                                            prove your business case. No bloat,
                                            no nice-to-haves.
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card className="p-8 bg-[#4ADE80] text-[#0B3D2E]">
                                    <CardContent className="space-y-4">
                                        <div className="text-4xl font-bold">
                                            Days 4-10
                                        </div>
                                        <h3 className="text-2xl font-bold">
                                            Build It
                                        </h3>
                                        <p className="leading-relaxed opacity-90">
                                            Our developers build your MVP with
                                            the core AI feature, functional
                                            front-end, and cloud hosting. You
                                            get daily updates.
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Deliverable Section - What You Get */}
                <section className="py-24 bg-[#0B3D2E] text-white">
                    <div className="container mx-auto px-6">
                        <div className="max-w-5xl mx-auto space-y-16">
                            <div className="text-center space-y-6">
                                <h2 className="text-5xl font-bold">
                                    A Tangible Business Asset,{" "}
                                    <span className="text-[#4ADE80]">
                                        Not a Toy.
                                    </span>
                                </h2>
                            </div>

                            <div className="space-y-8 text-lg leading-relaxed text-gray-300">
                                <p className="text-xl text-white font-medium">
                                    At the end of the sprint, you will have:
                                </p>
                            </div>

                            <div className="grid md:grid-cols-3 gap-8">
                                <Card className="p-8 bg-white/10 backdrop-blur border-white/20">
                                    <CardContent className="space-y-6">
                                        <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                                            <Rocket className="w-8 h-8 text-[#0B3D2E]" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white">
                                            Cloud-Hosted MVP
                                        </h3>
                                        <p className="text-gray-300 leading-relaxed">
                                            A secure, cloud-hosted AI Proof of
                                            Concept. Not local, not a
                                            prototype—a real, accessible
                                            product.
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card className="p-8 bg-white/10 backdrop-blur border-white/20">
                                    <CardContent className="space-y-6">
                                        <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                                            <Scale className="w-8 h-8 text-[#0B3D2E]" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white">
                                            Functional Front-End
                                        </h3>
                                        <p className="text-gray-300 leading-relaxed">
                                            A polished interface for user
                                            interaction. Ready for demos, ready
                                            for feedback, ready for investors.
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card className="p-8 bg-white/10 backdrop-blur border-white/20">
                                    <CardContent className="space-y-6">
                                        <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                                            <Brain className="w-8 h-8 text-[#0B3D2E]" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white">
                                            Core AI Feature
                                        </h3>
                                        <p className="text-gray-300 leading-relaxed">
                                            The AI-powered capability that makes
                                            your product unique—live and
                                            working, not just planned.
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="text-center">
                                <p className="text-2xl font-semibold text-[#4ADE80]">
                                    Ready for investor demos. Ready for user
                                    feedback. Ready to prove your business case.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section - The Qualification */}
                <section className="py-24 bg-white">
                    <div className="container mx-auto px-6">
                        <div className="max-w-4xl mx-auto text-center space-y-12">
                            <div className="space-y-6">
                                <h2 className="text-5xl font-bold text-gray-900">
                                    Is Our 10-Day Build Sprint{" "}
                                    <span className="text-[#4ADE80]">
                                        Right for You?
                                    </span>
                                </h2>
                                <p className="text-xl text-gray-700 leading-relaxed max-w-3xl mx-auto">
                                    This rapid process is powerful, but it's not
                                    for every idea. The first call is a
                                    technical and strategic assessment with our
                                    lead strategist to see if your project is a
                                    good fit.
                                </p>
                            </div>

                            <div className="space-y-6">
                                <p className="text-lg text-gray-600">
                                    Book a no-obligation call. We'll give you an
                                    honest assessment of whether we can build
                                    your MVP in 10 days.
                                </p>
                                <Button
                                    size="lg"
                                    className="bg-[#0B3D2E] hover:bg-[#145C43] text-white font-semibold px-12 py-7 text-xl rounded-2xl transition-all duration-300 hover:scale-105 shadow-lg"
                                >
                                    Schedule Your Assessment Call
                                    <ArrowUpRight className="inline-block w-6 h-6 ml-2" />
                                </Button>
                            </div>

                            {/* Trust indicators */}
                            <div className="pt-12 border-t border-gray-200">
                                <div className="grid md:grid-cols-3 gap-8 text-center">
                                    <div className="space-y-2">
                                        <div className="text-4xl font-bold text-[#0B3D2E]">
                                            10
                                        </div>
                                        <p className="text-gray-600">
                                            Days to MVP
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-4xl font-bold text-[#0B3D2E]">
                                            100%
                                        </div>
                                        <p className="text-gray-600">
                                            Working Product
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-4xl font-bold text-[#0B3D2E]">
                                            $0
                                        </div>
                                        <p className="text-gray-600">
                                            For Assessment Call
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer
                className="py-12 bg-[#06251B] text-white"
                role="contentinfo"
            >
                <div className="container mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-[#4ADE80]">
                                aicorelab.dev
                            </h3>
                            <p className="text-gray-400">
                                Leading AI Solution Platform
                            </p>
                        </div>
                        <div className="flex gap-8 text-gray-400">
                            <a
                                href="#"
                                className="hover:text-[#4ADE80] transition-colors"
                            >
                                Privacy
                            </a>
                            <a
                                href="#"
                                className="hover:text-[#4ADE80] transition-colors"
                            >
                                Terms
                            </a>
                            <a
                                href="#"
                                className="hover:text-[#4ADE80] transition-colors"
                            >
                                Contact
                            </a>
                        </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
                        <p>
                            &copy; 2025 aicorelab.dev | Leading AI Solution
                            Platform
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
