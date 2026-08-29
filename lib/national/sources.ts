export const CONCEPTS = [
  {
    term: "Immigré",
    definition:
      "Personne née étrangère à l’étranger et résidant en France ; elle peut avoir acquis la nationalité française.",
  },
  {
    term: "Étranger",
    definition:
      "Personne qui ne possède pas la nationalité française au moment de l’observation ; elle peut être née en France.",
  },
  {
    term: "Mis en cause",
    definition:
      "Personne identifiée par les forces de sécurité dans une affaire élucidée ; ce statut ne constitue pas une condamnation.",
  },
  {
    term: "Condamné",
    definition:
      "Personne faisant l’objet d’une décision judiciaire ; le champ, la date et l’unité statistique diffèrent des statistiques policières.",
  },
] as const;

export const DISTINCTIONS = [
  "immigré ≠ étranger",
  "étranger ≠ personne née à l’étranger",
  "mis en cause ≠ poursuivi",
  "mis en cause ≠ condamné",
  "victime enregistrée ≠ prévalence réelle",
  "corrélation ≠ causalité",
  "statistique agrégée ≠ comportement individuel",
] as const;

export const VARIABLE_DICTIONARY = [
  ["rôle", "victimes ou mis en cause"],
  ["indicateur", "catégorie SSMSI fiabilisée"],
  ["année", "année civile de l’enregistrement / de l’élucidation"],
  ["sexe", "modalité publiée par le SSMSI"],
  ["âge", "classe d’âge publiée par le SSMSI"],
  ["majorité", "modalité de majorité publiée par le SSMSI"],
  ["nationalité", "Française, Étrangère ou Ensemble selon le fichier"],
  ["nombre", "effectif enregistré ; null si secret statistique"],
  ["statut de diffusion", "information de diffusion du producteur"],
] as const;
