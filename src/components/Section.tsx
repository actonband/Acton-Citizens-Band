import React, { Suspense } from "react";
import MouseTrackingInstrument, {
  MouseTrackingInstrumentProps,
} from "./instruments/MouseTrackingInstrument";
const LazyMouseTrackingInstrument = React.lazy(() => import('./instruments/MouseTrackingInstrument'));

export type SectionImageProps = {
  path: string;
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
  return (
    <section
      className={`section`}
      style={{ scrollMarginTop: `${headerHeight ? headerHeight : 0}px` }}
    >
      {!image ? null : (
        <div className="section-top">
          <img className="section-image" src={image.path} alt={image.caption} />
          <div className="section-image-info">
            {!image.caption ? null : (
              <div className="section-image-caption">
                {image.caption as string}
              </div>
            )}
            {!image.credits ? null : (
              <div className="section-image-credits">
                Credits: {image.credits as string}
              </div>
            )}
          </div>
          <hr className="section-image-divider" />
        </div>
      )}
      <div className="section-bottom">
        <div
          id={id}
          className="section-content"
          style={{ scrollMarginTop: `${headerHeight}px` }}
        >
          <h2 className="section-title">{title}</h2>
          {!content ? null : content}
        </div>
        {!instrumentModel ? null : (
            <Suspense fallback={<div className={`mouse-tracking-instrument-container`}></div>}>
              <LazyMouseTrackingInstrument
                modelPath={instrumentModel.modelPath}
                tall={instrumentModel.tall}
              />
            </Suspense>
        )}
      </div>
    </section>
  );
};

export default Section;
