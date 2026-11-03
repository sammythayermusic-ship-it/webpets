// Things you might like (AFTER-BAKEOFF Step E.1): the tap-to-pick chips on the "Get to know me"
// card, and the words that mean them when you mention one while typing to the pet. Data in
// ./data/interests.ts. Written for kids and adults alike.

export interface Interest {
  /** Stable, what a profile stores: "video-games". */
  id: string;
  /** On the chip, and in the pet's lines, lower case reads naturally: "video games". */
  label: string;
  /**
   * Lower-case words or short phrases that mean it when typed ("gaming", "minecraft", "fortnite"
   * for video games). Whole words only; the label always counts.
   */
  words: readonly string[];
}
