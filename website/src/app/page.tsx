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
import SectionDivider from "@/components/SectionDivider";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <SectionDivider />
        <Features />
        <SectionDivider />
        <KitchenModeSpotlight />
        <SectionDivider />
        <AppShowcase />
        <SectionDivider />
        <HowItWorks />
        <SectionDivider />
        <Roadmap />
        <SectionDivider />
        <SocialProof />
        <SectionDivider />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
