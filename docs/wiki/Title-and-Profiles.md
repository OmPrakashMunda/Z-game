# The title screen, profiles and save slots

## The first time

The first visit in a browser opens the **Welcome** screen. Choose a **username** and how you look, then press **Continue**.

- A username has 3 to 16 characters: letters, numbers, spaces, `_` and `-`.
- **Another name** suggests one.
- Pick **Man** or **Woman**, a skin tone, a hair style (short, long or bald) and hair colour, and a shirt colour. The turntable on
  the right shows the result as you choose. Drag it to turn the character.

Your username and look are your **profile**. It is kept in this browser.

## The main menu

The town sits behind the menu, with traffic and a slowly turning view.

| Entry | What it does |
| --- | --- |
| **Single player** | Opens the save slots. |
| **Multiplayer** | Marked *Soon*. It cannot be opened yet. |
| **Profile** | Change your username and look. **Save** keeps the change, **Back** drops it. |
| **Settings** | Sound on or off, and the volume. |

At the top right, a card shows your username and that you are playing as a **Guest** (saves stay on this device), or as a
**Google** account (saves go to the cloud). Next to it is **Sign in with Google**, or **Sign out** when you are signed in. If the
game was built without Firebase settings, the button is greyed out and marked *Soon*.

## Save slots

**Single player** shows three slots. Each slot is a separate game.

- An empty slot offers **New game**.
- A used slot shows the survivor, the day, the money and when it was saved. It offers **Continue**, **New game** and a
  delete button. **New game** on a used slot and **Delete** both ask first.
- Saving always goes to the slot you opened. Slots do not affect each other.
- A save made before slots existed is in **Slot 1**. Saves without a look get the usual look for their gender.

## A new game: the survivor

**New game** opens the survivor screen. The name starts as your username and the look as your profile's. Change them if you
like, then press **Start game**. The look you choose becomes your profile's look for the next new game. The survivor's name
and look are saved with the game and shown in the character panel in the game: see [Clothing and character](Clothing-and-Character.md).

## Leaving a game

**Esc**, then **Save & exit to title**, saves to the slot and returns to the main menu. If you die, your last save is still in
its slot: open it again from the slots screen.

## Accounts

With Firebase set up, **Sign in with Google** at the top right is on. It gives you a profile with a unique username and keeps your
games in the cloud. Each slot then says where its game is kept. See [Accounts and cloud saves](Accounts-and-Cloud-Saves.md).
Without it, you play as a guest and everything stays on this device.

## In the code

- `src/ui/title.ts`: all the title screens (`TitleScreen`).
- `src/render/preview.ts`: the character turntable, with its own small renderer.
- `src/data/looks.ts`: the colours and hair styles, and `cleanLook`.
- `src/profile/profile.ts`: the username rules and the profile in `localStorage`.
- `src/account/account.ts`: who is playing (guest or Google) and sign-in.
- `src/save/store.ts`: three slots (`slot1`, `slot2`, `slot3`, each with a `.backup`), `listSlots`, `deleteGame`.
- `src/main.ts`: `showTitle`, `showSlots`, `startSurvivor` and `beginGame(state, isNew, slot)`.
