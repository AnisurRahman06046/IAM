import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

/** @see: https://docs.keycloakify.dev/features/i18n */
const { useI18n, ofTypeI18n } = i18nBuilder
    .withThemeName<ThemeName>()
    .withCustomTranslations({
        en: {
            loginAccountTitle: {
                "doer-visa": "Sign in to Doer Visa",
                "doer-admin": "Sign in to Doer Admin"
            },
            loginTitle: {
                "doer-visa": "Doer Visa",
                "doer-admin": "Doer Admin"
            },
            loginTitleHtml: {
                "doer-visa": "Doer Visa",
                "doer-admin": "Doer Admin"
            },
            doLogIn: {
                "doer-visa": "Sign In",
                "doer-admin": "Sign In"
            },
            doRegister: {
                "doer-visa": "Create Account",
                "doer-admin": "Create Account"
            },
            noAccount: {
                "doer-visa": "New to Doer Visa?",
                "doer-admin": "Need admin access?"
            }
        }
    })
    .build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
