import type { Lang } from "@karaoke-tube/ui";

export type LegalDoc = { title: string; updated: string; sections: Array<{ h: string; p: string[] }> };

/** Plain-language privacy notice and terms, per language. Keep them true to what the app stores (see apps/api). */
export const LEGAL: Record<"privacy" | "terms", Record<Lang, LegalDoc>> = {
  privacy: {
    en: {
      title: "Privacy",
      updated: "Last updated 3 November 2026",
      sections: [
        {
          h: "As a guest",
          p: [
            "You don't need an account. When you join a party you pick a nickname and an avatar; the host and the other guests see them, and the TV shows them.",
            "That information, the songs you add and your reactions live in the party, and are removed a short time after the party ends. If the host turns on recaps, the end-of-night summary (nicknames, songs, awards) is kept for 30 days at a link anyone with it can open.",
            "This browser keeps a few small settings on your device (language, your spot in the party, preferences) so a refresh doesn't kick you out.",
          ],
        },
        {
          h: "If you make an account",
          p: [
            "We store a username, a display name, an avatar, a short tagline, a salted hash of your password (never the password), your favorite songs, your friends, and a list of parties you joined. We don't ask for an email address.",
            "You can delete your account at any time from your profile; that removes this information.",
          ],
        },
        {
          h: "What we see automatically",
          p: [
            "Our host (Cloudflare) processes your IP address to deliver the site and to limit abuse, such as guessing party codes. We don't build advertising profiles and we don't sell data.",
          ],
        },
        {
          h: "YouTube",
          p: [
            "Songs play through YouTube's embedded player. When a video plays, YouTube (Google) may collect data under its own terms and privacy policy. We don't control that.",
          ],
        },
        {
          h: "Questions",
          p: ["Ask the person who runs this site. If you are a host, you are responsible for the guests you invite."],
        },
      ],
    },
    es: {
      title: "Privacidad",
      updated: "Última actualización: 3 de noviembre de 2026",
      sections: [
        {
          h: "Como invitado",
          p: [
            "No necesitas una cuenta. Al unirte a una fiesta eliges un apodo y un avatar; el anfitrión y los demás invitados los ven, y la tele también.",
            "Esa información, las canciones que agregas y tus reacciones viven en la fiesta y se eliminan poco después de que termina. Si el anfitrión activa los resúmenes, el resumen de la noche (apodos, canciones, premios) se guarda 30 días en un enlace que puede abrir cualquiera que lo tenga.",
            "Este navegador guarda algunos ajustes pequeños en tu dispositivo (idioma, tu lugar en la fiesta, preferencias) para que al refrescar no te saque.",
          ],
        },
        {
          h: "Si creas una cuenta",
          p: [
            "Guardamos un usuario, un nombre para mostrar, un avatar, una frase corta, un hash con sal de tu contraseña (nunca la contraseña), tus canciones favoritas, tus amigos y la lista de fiestas a las que entraste. No pedimos correo electrónico.",
            "Puedes borrar tu cuenta cuando quieras desde tu perfil; eso elimina esta información.",
          ],
        },
        {
          h: "Lo que vemos automáticamente",
          p: [
            "Nuestro proveedor (Cloudflare) procesa tu dirección IP para entregar el sitio y limitar abusos, como adivinar códigos de fiesta. No creamos perfiles publicitarios ni vendemos datos.",
          ],
        },
        {
          h: "YouTube",
          p: [
            "Las canciones se reproducen con el reproductor incrustado de YouTube. Al reproducir un video, YouTube (Google) puede recopilar datos bajo sus propios términos y política de privacidad. No lo controlamos.",
          ],
        },
        {
          h: "Preguntas",
          p: ["Pregunta a quien administra este sitio. Si eres anfitrión, eres responsable de los invitados que traes."],
        },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms of use",
      updated: "Last updated 3 November 2026",
      sections: [
        {
          h: "What this is",
          p: [
            "Karaoke Tube lets a group run a karaoke night: a host puts videos on a TV and guests add songs from their phones. It is provided as is, with no guarantee that it is always available or that every song will play.",
          ],
        },
        {
          h: "Videos",
          p: [
            "Videos come from YouTube and play in YouTube's own player. We don't host or copy them. Some videos can't be embedded; when that happens the song is skipped. YouTube's terms of service apply to what you watch.",
          ],
        },
        {
          h: "Behave",
          p: [
            "Choose nicknames and songs that are fine for everyone in the room. Hosts can remove guests and songs. Don't try to break, overload or guess your way into other people's parties.",
            "Hosts are responsible for the party they run, including playing music in public places.",
          ],
        },
        {
          h: "Accounts",
          p: ["Keep your password to yourself. We may remove accounts or parties that are abused."],
        },
        {
          h: "Changes",
          p: ["We may update these terms. Using the site after a change means you accept it."],
        },
      ],
    },
    es: {
      title: "Términos de uso",
      updated: "Última actualización: 3 de noviembre de 2026",
      sections: [
        {
          h: "Qué es esto",
          p: [
            "Karaoke Tube permite a un grupo hacer una noche de karaoke: un anfitrión pone los videos en la tele y los invitados agregan canciones desde su celular. Se ofrece tal cual, sin garantía de que siempre esté disponible ni de que todas las canciones se reproduzcan.",
          ],
        },
        {
          h: "Videos",
          p: [
            "Los videos vienen de YouTube y se reproducen en su propio reproductor. No los alojamos ni los copiamos. Algunos videos no se pueden incrustar; en ese caso la canción se salta. Los términos de servicio de YouTube se aplican a lo que ves.",
          ],
        },
        {
          h: "Buen comportamiento",
          p: [
            "Elige apodos y canciones que estén bien para todos en la sala. Los anfitriones pueden quitar invitados y canciones. No intentes romper, sobrecargar ni adivinar la entrada a fiestas ajenas.",
            "Los anfitriones son responsables de la fiesta que organizan, incluida la música en lugares públicos.",
          ],
        },
        {
          h: "Cuentas",
          p: ["Guarda tu contraseña para ti. Podemos eliminar cuentas o fiestas que se usen para abusar."],
        },
        {
          h: "Cambios",
          p: ["Podemos actualizar estos términos. Seguir usando el sitio tras un cambio significa que lo aceptas."],
        },
      ],
    },
  },
};
