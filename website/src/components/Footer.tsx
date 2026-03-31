import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-card-border py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo and brand */}
          <div className="flex items-center gap-3">
            <Image
              src="/media/app-icon-dark.png"
              alt="Dialed"
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-semibold tracking-tight">dialed</span>
            <span className="text-muted text-sm">Meals & Macros</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-muted">
            <a href="#" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              Contact
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              App Store
            </a>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-card-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted text-xs">
            &copy; {new Date().getFullYear()} Dialed. All rights reserved.
          </p>
          <p className="text-muted/50 text-xs">
            Nutritional data sourced from USDA FoodData Central.
          </p>
        </div>
      </div>
    </footer>
  );
}
