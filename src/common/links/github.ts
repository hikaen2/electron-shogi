import {
  getBlackPlayerNamePreferShort,
  getWhitePlayerNamePreferShort,
  ImmutableRecord,
} from "tsshogi";

export const ghAccount = "sunfish-shogi";
export const ghRepository = "shogihome";
export const ghDomain = "github.com";
export const ghioDomain = `${ghAccount}.github.io`;
const howToUseTitle = "%E4%BD%BF%E3%81%84%E6%96%B9";
const fileNameTemplateTitle =
  "%E6%A3%8B%E8%AD%9C%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E5%90%8D%E3%83%86%E3%83%B3%E3%83%97%E3%83%AC%E3%83%BC%E3%83%88";
const maxPVLengthTitle =
  "%E8%AA%AD%E3%81%BF%E7%AD%8B%E8%A1%A8%E7%A4%BA%E6%89%8B%E6%95%B0%E3%81%AE%E5%88%B6%E9%99%90";

export const websiteURL = `https://${ghioDomain}/${ghRepository}/`;
export const thirdPartyLicenseURL = `https://${ghioDomain}/${ghRepository}/third-party-licenses.html`;
export const wikiPageBaseURL = `https://${ghDomain}/${ghAccount}/${ghRepository}/wiki/`;
export const howToUseWikiPageURL = `${wikiPageBaseURL}${howToUseTitle}`;
export const fileNameTemplateWikiPageURL = `${wikiPageBaseURL}${fileNameTemplateTitle}`;
export const maxPVLengthSettingWikiPageURL = `${wikiPageBaseURL}${maxPVLengthTitle}`;
export const latestReleaseURL = `https://${ghDomain}/${ghAccount}/${ghRepository}/releases/latest`;
export function stableReleaseURL(tag: string) {
  return `https://${ghDomain}/${ghAccount}/${ghRepository}/releases/tag/${tag}`;
}
export const licenseURL = `https://${ghDomain}/${ghAccount}/${ghRepository}/blob/main/LICENSE`;

const webAppBaseURL = `https://${ghioDomain}/${ghRepository}/webapp/index.html`;

export function webAppURL(record?: ImmutableRecord) {
  if (!record) {
    return webAppBaseURL;
  }
  const [usen, branch] = record.usen;
  const ply = record.current.ply;
  const bname = encodeURIComponent(getBlackPlayerNamePreferShort(record.metadata) || "");
  const wname = encodeURIComponent(getWhitePlayerNamePreferShort(record.metadata) || "");
  return `${webAppBaseURL}?usen=${usen}&branch=${branch || 0}&ply=${ply || 0}&bname=${bname}&wname=${wname}`;
}

export function mobileWebAppURL(record?: ImmutableRecord) {
  if (!record) {
    return webAppBaseURL + "?mobile";
  }
  return `${webAppURL(record)}&mobile`;
}
