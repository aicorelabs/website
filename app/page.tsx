import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowUpRight, Brain, Rocket, Scale, Zap } from "lucide-react"
import { RippleEffect } from "@/components/ripple-effect"
import { CustomCursor } from "@/components/custom-cursor"
import { Navigation } from "@/components/navigation"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white cursor-none">
      <RippleEffect />
      <CustomCursor />
      {/* Navigation Component */}
      <Navigation />

      <main role="main">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center pt-16" aria-label="Hero section">
          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left Side - Minimal Brand & Powerful Message */}
              <article className="space-y-12">
                <header className="space-y-4">
                  <div className="flex items-center gap-2 text-[#4ADE80] text-sm font-medium tracking-wide">
                    <span>aicorelab</span>
                    <ArrowUpRight className="w-4 h-4" />
                    <span>dev</span>
                  </div>
                  <h1 className="text-7xl font-bold text-[#0B3D2E] font-[family-name:var(--font-space-grotesk)] leading-tight">
                    aicorelab.dev
                    <ArrowUpRight className="inline-block w-16 h-16 ml-4 text-[#4ADE80]" />
                  </h1>
                </header>

                <div className="space-y-6">
                  <h2 className="text-4xl font-bold text-gray-900 leading-tight">
                    Leading AI Solution Platform.
                    <br />
                    <span className="text-[#4ADE80]">Apps in 10 days.</span>
                  </h2>
                  <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                    The industry's leading AI platform for businesses. We transform your ideas into powerful AI solutions without the tech complexity.
                  </p>
                </div>
                  AI apps in 10 days.
                  <br />
                  <span className="text-[#4ADE80]">No tech headaches.</span>
                </h2>
                <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                  We turn your idea into a working AI product while you focus on your business.
                </p>
              </div>

              <Button
                size="lg"
                className="bg-[#00FFB2] hover:bg-[#4ADE80] text-black font-semibold px-10 py-6 text-lg rounded-2xl glow-effect transition-all duration-300 hover:scale-105 shadow-lg"
              >
                Start Your AI Project
              </Button>
              </article>

            {/* Right Side - Clean AI Visual with Services */}
            <div className="relative">
              <div className="aspect-[4/3] rounded-3xl overflow-hidden relative shadow-2xl bg-gradient-to-br from-[#0B3D2E] via-[#145C43] to-[#4ADE80]">
                {/* Neural network pattern */}
                <div className="absolute inset-0 opacity-10">
                  <svg className="w-full h-full" viewBox="0 0 400 300" fill="none">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    {/* Connection lines */}
                    <g stroke="white" strokeWidth="2" opacity="0.3">
                      <line x1="50" y1="80" x2="150" y2="120" />
                      <line x1="50" y1="120" x2="150" y2="80" />
                      <line x1="50" y1="160" x2="150" y2="120" />
                      <line x1="150" y1="80" x2="250" y2="100" />
                      <line x1="150" y1="120" x2="250" y2="100" />
                      <line x1="150" y1="120" x2="250" y2="140" />
                      <line x1="250" y1="100" x2="350" y2="120" />
                      <line x1="250" y1="140" x2="350" y2="120" />
                    </g>
                    {/* Nodes */}
                    <g fill="white">
                      <circle cx="50" cy="80" r="6" />
                      <circle cx="50" cy="120" r="6" />
                      <circle cx="50" cy="160" r="6" />
                      <circle cx="150" cy="80" r="8" />
                      <circle cx="150" cy="120" r="8" />
                      <circle cx="250" cy="100" r="8" />
                      <circle cx="250" cy="140" r="8" />
                      <circle cx="350" cy="120" r="6" />
                    </g>
                  </svg>
                </div>
                <div className="absolute inset-0 flex flex-col justify-center items-center text-white space-y-12">
                  <div className="text-center space-y-8">
                    <h3 className="text-5xl font-bold drop-shadow-lg">Build ai</h3>
                    <h3 className="text-5xl font-bold drop-shadow-lg">Scale ai</h3>
                    <h3 className="text-5xl font-bold drop-shadow-lg">Deploy ai</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 bg-neutral-50" id="services">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-4xl font-bold text-[#B8860B] font-[family-name:var(--font-space-grotesk)] italic">
              Why Choose the Leader
            </h2>
            <h3 className="text-5xl font-bold text-gray-900 max-w-4xl mx-auto leading-tight">
              Most businesses struggle with AI implementation. The leading platform makes it effortless.
            </h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              While others promise complex AI solutions, aicorelab.dev delivers the industry's most proven platform for rapid AI deployment and scaling.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="p-8 bg-white shadow-lg">
              <CardContent className="space-y-4">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-red-600" />
                </div>
                <h4 className="text-xl font-semibold">Technical Overwhelm</h4>
                <p className="text-gray-600">
                  Complex AI jargon, multiple platforms, and technical requirements create analysis paralysis for
                  business owners.
                </p>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg">
              <CardContent className="space-y-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Brain className="w-6 h-6 text-orange-600" />
                </div>
                <h4 className="text-xl font-semibold">Expensive Development</h4>
                <p className="text-gray-600">
                  Hiring AI engineers costs $150k+ annually, with 6+ month timelines and uncertain outcomes.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl font-bold text-gray-900">Your AI Partner — From Idea to Launch</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              We handle the technical complexity so you can focus on growing your business.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 bg-[#0B3D2E] text-white">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-[#0B3D2E]" />
                </div>
                <h3 className="text-2xl font-bold">Build</h3>
                <p className="text-gray-300 leading-relaxed">
                  MVP in 10 days. We turn your idea into a working AI product with clean interfaces and smart
                  automation.
                </p>
              </CardContent>
            </Card>

            <Card className="p-8 bg-[#0B3D2E] text-white">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                  <Scale className="w-8 h-8 text-[#0B3D2E]" />
                </div>
                <h3 className="text-2xl font-bold">Scale</h3>
                <p className="text-gray-300 leading-relaxed">
                  AI systems that grow with your business. Handle thousands of users without breaking a sweat.
                </p>
              </CardContent>
            </Card>

            <Card className="p-8 bg-[#0B3D2E] text-white">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-[#4ADE80] rounded-2xl flex items-center justify-center">
                  <Zap className="w-8 h-8 text-[#0B3D2E]" />
                </div>
                <h3 className="text-2xl font-bold">Deploy</h3>
                <p className="text-gray-300 leading-relaxed">
                  Full support & hosting. We manage the infrastructure so you can focus on your customers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-24 bg-neutral-50" id="process">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl font-bold text-gray-900">How It Works (In Plain English)</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Our proven 4-step process takes you from idea to launch in just 10 days.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {[
                {
                  step: "01",
                  title: "You share your idea in a call",
                  description:
                    "30-minute discovery call to understand your vision, goals, and requirements. No technical jargon, just clear communication.",
                  icon: "💡",
                },
                {
                  step: "02",
                  title: "We design a simple plan (no jargon)",
                  description:
                    "Receive a clear roadmap with mockups, features, and timeline. Everything explained in business terms you understand.",
                  icon: "🛠️",
                },
                {
                  step: "03",
                  title: "You get a working AI product in 10 days",
                  description:
                    "Daily updates as we build your MVP. Test features as they're completed and provide feedback in real-time.",
                  icon: "🚀",
                },
                {
                  step: "04",
                  title: "We scale & support as you grow",
                  description:
                    "Ongoing maintenance, feature additions, and scaling support. Your AI solution evolves with your business needs.",
                  icon: "🌱",
                },
              ].map((item, index) => (
                <div key={index} className="flex gap-8 items-start">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-[#0B3D2E] rounded-2xl flex items-center justify-center text-white font-bold text-lg">
                      {item.step}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{item.icon}</span>
                      <h3 className="text-2xl font-bold text-gray-900">{item.title}</h3>
                    </div>
                    <p className="text-gray-600 text-lg leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl font-bold text-gray-900">Why Founders Trust Us</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Built on industry-leading AI platforms with proven results.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            <Card className="p-8 bg-white shadow-lg border-l-4 border-[#4ADE80]">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-[#0B3D2E] rounded-full flex items-center justify-center text-white font-bold">
                    SJ
                  </div>
                  <div>
                    <h4 className="font-semibold">Sarah Johnson</h4>
                    <p className="text-sm text-gray-600">CEO, TechStart</p>
                  </div>
                </div>
                <p className="text-gray-700 italic">
                  "They delivered our AI customer service bot in 8 days. It handles 80% of our support tickets
                  automatically. Game changer."
                </p>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg border-l-4 border-[#4ADE80]">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-[#0B3D2E] rounded-full flex items-center justify-center text-white font-bold">
                    MR
                  </div>
                  <div>
                    <h4 className="font-semibold">Mike Rodriguez</h4>
                    <p className="text-sm text-gray-600">Founder, SalesFlow</p>
                  </div>
                </div>
                <p className="text-gray-700 italic">
                  "Our AI sales assistant increased qualified leads by 300%. The ROI was immediate and the team was
                  incredibly responsive."
                </p>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg border-l-4 border-[#4ADE80]">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-[#0B3D2E] rounded-full flex items-center justify-center text-white font-bold">
                    AL
                  </div>
                  <div>
                    <h4 className="font-semibold">Anna Lee</h4>
                    <p className="text-sm text-gray-600">Director, ContentCorp</p>
                  </div>
                </div>
                <p className="text-gray-700 italic">
                  "They built our content generation pipeline that saves us 20 hours per week. Professional, fast, and
                  exactly what we needed."
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Trust Badges */}
          <div className="text-center">
            <p className="text-gray-600 mb-8">Built on trusted AI platforms:</p>
            <div className="flex justify-center items-center gap-12 opacity-60">
              <span className="text-2xl font-bold">OpenAI</span>
              <span className="text-2xl font-bold">Hugging Face</span>
              <span className="text-2xl font-bold">AWS</span>
              <span className="text-2xl font-bold">Vercel</span>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Section */}
      <section className="py-24 bg-neutral-50" id="showcase">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl font-bold text-gray-900">AI in Action</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Real AI solutions we've built for founders like you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 bg-white shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Brain className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold">AI Customer Support Chatbot</h3>
                <p className="text-gray-600 leading-relaxed">
                  Intelligent chatbot that handles customer inquiries 24/7, escalates complex issues to humans, and
                  learns from every interaction.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Natural Language Processing
                  </span>
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    24/7 Support
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold">Sales Intelligence Tool</h3>
                <p className="text-gray-600 leading-relaxed">
                  AI-powered lead scoring, automated outreach sequences, and predictive analytics to identify your best
                  prospects.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Lead Scoring
                  </span>
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Automation
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                  <Zap className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-2xl font-bold">Content Generation Pipeline</h3>
                <p className="text-gray-600 leading-relaxed">
                  Automated content creation for blogs, social media, and marketing materials that matches your brand
                  voice perfectly.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Content AI
                  </span>
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Brand Voice
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="p-8 bg-white shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="space-y-6">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center">
                  <Scale className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-2xl font-bold">Custom AI Dashboard</h3>
                <p className="text-gray-600 leading-relaxed">
                  Real-time business intelligence dashboard with AI-powered insights, predictions, and automated
                  reporting.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Analytics
                  </span>
                  <span className="px-3 py-1 bg-[#4ADE80] text-[#0B3D2E] rounded-full text-sm font-medium">
                    Predictions
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-[#0B3D2E] text-white" id="contact">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-6xl font-bold font-[family-name:var(--font-space-grotesk)]">
              Your AI product is 10 days away.
            </h2>
            <p className="text-2xl text-gray-300 leading-relaxed">
              Let's turn your idea into reality. Book a free discovery call and see what we can build together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="bg-[#00FFB2] hover:bg-[#4ADE80] text-black font-semibold px-12 py-6 text-xl rounded-2xl glow-effect transition-all duration-300 hover:scale-105"
              >
                Book a Free Discovery Call
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-[#4ADE80] text-[#4ADE80] hover:bg-[#4ADE80] hover:text-[#0B3D2E] px-8 py-6 text-xl rounded-2xl transition-all duration-300 bg-transparent"
              >
                See what we can build together →
              </Button>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="py-12 bg-[#06251B] text-white" role="contentinfo">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-[#4ADE80]">aicorelab.dev</h3>
              <p className="text-gray-400">Leading AI Solution Platform</p>
            </div>
            <div className="flex gap-8 text-gray-400">
              <a href="#" className="hover:text-[#4ADE80] transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-[#4ADE80] transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-[#4ADE80] transition-colors">
                Contact
              </a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
            <p>&copy; 2025 aicorelab.dev | Leading AI Solution Platform</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
