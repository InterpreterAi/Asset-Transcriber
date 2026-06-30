import Navbar from "@/components/landing/navbar";
import Hero from "@/components/landing/hero";
import TrustedBy from "@/components/landing/trusted-by";
import LiveDemo from "@/components/landing/live-demo";
import Stats from "@/components/landing/stats";
import Features from "@/components/landing/features";
import Testimonials from "@/components/landing/testimonials";
import Pricing from "@/components/landing/pricing";
import CTA from "@/components/landing/cta";
import Footer from "@/components/landing/footer";

export default function Landing() {
  return (
    <div className="landing-v3-surface min-h-screen bg-background text-foreground selection:bg-primary/30">
      <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <Navbar />
      <main className="relative pt-24">
        <Hero />
        <TrustedBy />
        <LiveDemo />
        <Stats />
        <Features />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
