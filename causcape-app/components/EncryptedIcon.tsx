import { Tooltip } from "@causcape/causcape/components/Tooltip";
import { shield } from "@causcape/causcape/components/icons";
import { useI18n } from "@causcape/causcape/i18n";

export const EncryptedIcon = () => {
  const { t } = useI18n();

  return (
    <a
      className="encrypted-icon tooltip"
      href="https://plus.causcape.com/blog/end-to-end-encryption"
      target="_blank"
      rel="noopener"
      aria-label={t("encrypted.link")}
    >
      <Tooltip label={t("encrypted.tooltip")} long={true}>
        {shield}
      </Tooltip>
    </a>
  );
};
