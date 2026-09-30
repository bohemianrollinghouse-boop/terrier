import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sortie autonome : Next rassemble lui-même le serveur et ses dépendances.
  // Cela évite à l'outil Firebase de fabriquer des liens symboliques vers
  // node_modules, que Windows refuse hors mode développeur.
  output: "standalone",
};

export default nextConfig;
