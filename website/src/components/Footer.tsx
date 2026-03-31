import Image from "next/image";
import Link from "next/link";

const footerLinks = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/features/kitchen-mode", label: "Kitchen Mode" },
    { href: "/features/scale", label: "Smart Scale" },
    { href: "/roadmap", label: "Roadmap" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/access", label: "Get Access" },
  ],
  Legal: [
    { href: "#", label: "Privacy" },
    { href: "#", label: "Terms" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-card-border py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/media/app-icon-dark.png"
                alt="Dialed"
                width={28}
                height={28}
                className="rounded-lg rotate-90"
              />
              <span className="font-semibold tracking-tight">dialed</span>
            </div>
            <p className="text-muted text-sm leading-relaxed">
              Meals & Macros.
              <br />
              Track less. Know more.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted text-sm hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-card-border flex flex-col md:flex-row items-center justify-between gap-4">
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
