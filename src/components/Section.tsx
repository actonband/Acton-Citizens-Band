import React, { Suspense, useEffect, useRef, useState } from "react";
import type { MouseTrackingInstrumentProps } from "./instruments/MouseTrackingInstrument";
const LazyMouseTrackingInstrument = React.lazy(
  () => import("./instruments/MouseTrackingInstrument"),
);

export type SectionImageProps = {
  path: string;
  width?: number;
  height?: number;
  caption?: string;
  credits?: string;
};

export type SectionProps = {
  id: string;
  navItem?: string;
  title: string;
  content?: JSX.Element;
  image?: SectionImageProps;
  instrumentModel?: MouseTrackingInstrumentProps;
  headerHeight?: number;
};

const Section: React.FC<SectionProps> = ({
  id,
  title,
  content,
  image,
  instrumentModel,
  headerHeight,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!instrumentModel || !sectionRef.current) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [instrumentModel]);
  return (
    <>
      {!image ? null : (
        <figure className={`photo-break ${id === "about" ? "photo-break-opening" : ""}`}>
          <img
            className="photo-break-image"
            src={image.path}
            alt={image.caption ?? ""}
            width={image.width}
            height={image.height}
            loading={id === "about" ? "eager" : "lazy"}
          />
          <figcaption className="photo-break-caption">
            {!image.caption ? null : <span>{image.caption}</span>}
            {!image.credits ? null : <span>Credits: {image.credits}</span>}
          </figcaption>
        </figure>
      )}
      <section
        ref={sectionRef}
        className={`section ${instrumentModel ? "section-with-instrument" : ""}`}
        aria-labelledby={`${id}-title`}
      >
        <div className="section-bottom">
          <div
            id={id}
            className="section-content"
            style={{ scrollMarginTop: `${headerHeight ?? 0}px` }}
          >
            <h2 id={`${id}-title`} className="section-title">
              {title}
            </h2>
            {!content ? null : content}
          </div>
          {!instrumentModel || !nearViewport ? null : (
            <div className="instrument-stage" aria-hidden="true">
              <Suspense fallback={null}>
                <LazyMouseTrackingInstrument
                  modelPath={instrumentModel.modelPath}
                  tall={instrumentModel.tall}
                />
              </Suspense>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Section;
