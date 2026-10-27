export const site = {
  url: "https://actoncitizensband.ca",
  name: "Acton Citizens' Band",
  title: "Acton Citizens' Band | Community Concert & Marching Band, Ontario",
  description:
    "Community music in Acton, Ontario since 1872. Discover our concerts, join the band, or learn an instrument with free lessons and instrument loans.",
  image: "/img/social/ACB-Social-Preview.png",
  imageAlt: "Acton Citizens' Band logo",
  imageWidth: 1280,
  imageHeight: 640,
  imageType: "image/png",
  profiles: [
    "https://maps.app.goo.gl/snw3w5NBsapRR3beA",
    "https://www.facebook.com/ActonBand/",
    "https://www.instagram.com/actonband/",
  ],
};

export function bandStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MusicGroup",
        "@id": `${site.url}/#band`,
        name: site.name,
        url: `${site.url}/`,
        description: site.description,
        foundingDate: "1872",
        email: "actonband@gmail.com",
        logo: `${site.url}/img/branding/band-logo.png`,
        image: `${site.url}${site.image}`,
        foundingLocation: { "@type": "Place", name: "Acton, Ontario, Canada" },
        address: {
          "@type": "PostalAddress",
          streetAddress: "85 Wallace Street",
          addressLocality: "Acton",
          addressRegion: "ON",
          postalCode: "L7J 2G1",
          addressCountry: "CA",
        },
        sameAs: site.profiles,
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        url: `${site.url}/`,
        name: site.name,
        inLanguage: "en-CA",
        publisher: { "@id": `${site.url}/#band` },
      },
    ],
  };
}
