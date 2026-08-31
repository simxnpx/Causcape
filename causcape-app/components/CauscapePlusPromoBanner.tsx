export const CauscapePlusPromoBanner = ({
  isSignedIn,
}: {
  isSignedIn: boolean;
}) => {
  return (
    <a
      href={
        isSignedIn
          ? import.meta.env.VITE_APP_PLUS_APP
          : `${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=causcape&utm_medium=app&utm_content=guestBanner#causcape-redirect`
      }
      target="_blank"
      rel="noopener"
      className="plus-banner"
    >
      Causcape+
    </a>
  );
};
