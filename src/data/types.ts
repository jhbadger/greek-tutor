export interface VocabEntry {
  greek: string;
  phonetic: string;
  english: string;
}

export interface DialogueTurn {
  speaker: string;
  greek: string;
  phonetic: string;
  english: string;
}

export interface Section {
  dialogue: DialogueTurn[];
  vocab: VocabEntry[];
}

export interface Chapter {
  id: string;
  title: { greek: string; english: string };
  sections: Section[];
}

export interface LessonsData {
  chapters: Chapter[];
}
