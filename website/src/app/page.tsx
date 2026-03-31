import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import KitchenModeSpotlight from "@/components/KitchenModeSpotlight";
import AppShowcase from "@/components/AppShowcase";
import HowItWorks from "@/components/HowItWorks";
import Roadmap from "@/components/Roadmap";
import SocialProof from "@/components/SocialProof";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <KitchenModeSpotlight />
        <AppShowcase />
        <HowItWorks />
        <Roadmap />
        <SocialProof />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
