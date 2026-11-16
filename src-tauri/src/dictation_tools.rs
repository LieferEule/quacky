//! What happens to dictated text between the model and the cursor, by fixed
//! rules only: spoken commands ("neue Zeile", "abschicken", "lösch das") and
//! the user's replacements ("meine Mail" -> the address).
//!
//! Everything here is deterministic and local. The one optional exception,
//! fixing self-corrections with Apple Intelligence, lives in `actions.rs` and
//! only decides *whether* to ask through [`has_correction_cue`] and
//! [`accept_correction`].

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::settings::TextReplacement;

/// What a dictation turns into once spoken commands are taken out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Spoken {
    /// Text to insert. `submit` asks for the send key afterwards; the text may
    /// be empty when the whole dictation was just "abschicken".
    Text { text: String, submit: bool },
    /// The whole dictation was "lösch das": remove what Quacky inserted last.
    DeleteLast,
}

static DELETE_LAST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^[\s.,!]*(lösch(e)? das( wieder)?|delete that|scratch that)[\s.,!]*$").unwrap()
});

/// "lösch das" inside a dictation: it takes back everything said before it.
/// Counts only when the model marked it as its own phrase, either with
/// punctuation in front ("…, lösch das, …") or by starting a new sentence with
/// it ("… Obwohl Lösch das …"). A plain "bitte lösch das Foto" stays text.
static DELETE_BEFORE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?:[.,;:!?]\s*(?i:lösch(?:e)? das|delete that|scratch that)|\s(?:Lösch(?:e)? das|Delete that|Scratch that))\b[\s.,;:!?]*",
    )
    .unwrap()
});

static NEW_PARAGRAPH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[ \t]*,?[ \t]*\b(neuer absatz|new paragraph)\b[.,:;]?[ \t]*").unwrap()
});

static NEW_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[ \t]*,?[ \t]*\b(neue zeile|new line)\b[.,:;]?[ \t]*").unwrap()
});

/// "abschicken" only counts as its own sentence at the very end, so "Kannst du
/// das abschicken?" stays a question.
static SUBMIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(^|[.!?,])\s*(abschicken|absenden|send it)[.!]?\s*$").unwrap()
});

/// The first letter after a line break.
static LINE_START: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n(\p{Ll})").unwrap());

/// Read spoken commands out of a dictation.
pub fn parse_commands(text: &str) -> Spoken {
    if DELETE_LAST.is_match(text) {
        return Spoken::DeleteLast;
    }

    let mut submit = false;
    let mut text = text.to_string();
    // Keep only what came after the last in-dictation "lösch das".
    if let Some(m) = DELETE_BEFORE.find_iter(&text).last() {
        let rest = text[m.end()..].trim_start();
        let mut chars = rest.chars();
        text = match chars.next() {
            Some(first) => first.to_uppercase().chain(chars).collect(),
            None => String::new(),
        };
    }
    if let Some(caps) = SUBMIT.captures(&text) {
        let whole = caps.get(0).unwrap();
        // Keep a sentence end before the command, drop a comma.
        let keep = match caps.get(1).map(|m| m.as_str()) {
            Some(p) if p != "," => p,
            _ => "",
        };
        text = format!("{}{}", &text[..whole.start()], keep);
        submit = true;
    }

    let text = NEW_PARAGRAPH.replace_all(&text, "\n\n");
    let text = NEW_LINE.replace_all(&text, "\n");
    let text = LINE_START.replace_all(&text, |caps: &regex::Captures| {
        format!("\n{}", caps[1].to_uppercase())
    });

    Spoken::Text {
        // Spaces only: a bare "neue Zeile" is meant to insert a line break.
        text: text.trim_matches([' ', '\t']).to_string(),
        submit,
    }
}

/// The words of a trigger, lowercased, so "Impressum-Link", "impressum link"
/// and "Impressum  Link" are the same key.
fn trigger_key(s: &str) -> String {
    s.split(|c: char| c.is_whitespace() || c == '-')
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Apply the user's replacements in one pass, longest trigger first, so the
/// text one replacement inserts is never replaced again.
pub fn apply_replacements(text: &str, replacements: &[TextReplacement]) -> String {
    let mut by_key: HashMap<String, &str> = HashMap::new();
    let mut patterns: Vec<(usize, String)> = Vec::new();

    for r in replacements {
        let key = trigger_key(&r.from);
        if key.is_empty() || by_key.contains_key(&key) {
            continue;
        }
        let words: Vec<String> = key.split(' ').map(regex::escape).collect();
        let mut pattern = words.join(r"[\s-]+");
        let starts_word = key.chars().next().is_some_and(|c| c.is_alphanumeric());
        let ends_word = key.chars().last().is_some_and(|c| c.is_alphanumeric());
        if starts_word {
            pattern = format!(r"\b{pattern}");
        }
        if ends_word {
            pattern = format!(r"{pattern}\b");
        }
        patterns.push((key.chars().count(), pattern));
        by_key.insert(key, r.to.as_str());
    }

    if patterns.is_empty() {
        return text.to_string();
    }
    patterns.sort_by(|a, b| b.0.cmp(&a.0));
    let alternation = patterns
        .iter()
        .map(|(_, p)| format!("(?:{p})"))
        .collect::<Vec<_>>()
        .join("|");
    let Ok(re) = Regex::new(&format!("(?i){alternation}")) else {
        return text.to_string();
    };

    let replaced = re.replace_all(text, |caps: &regex::Captures| {
        let found = &caps[0];
        by_key
            .get(&trigger_key(found))
            .map(|to| to.to_string())
            .unwrap_or_else(|| found.to_string())
    });
    // A replacement with nothing in `to` deletes a word; tidy the gap it leaves.
    replaced
        .split('\n')
        .map(|line| {
            line.split(' ')
                .filter(|w| !w.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

static CORRECTION_CUE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b(nein|nee|ich mein(e)?|sorry|quatsch|korrektur|stopp|oder besser|i mean|actually|scratch that|wait|or rather)\b|\b(ne|no),",
    )
    .unwrap()
});

/// Only dictations that sound like they correct themselves go to the model,
/// so everything else stays as fast as before.
pub fn has_correction_cue(text: &str) -> bool {
    CORRECTION_CUE.is_match(text)
}

/// Guard against the model answering or rewriting instead of only removing
/// the corrected part: the result must be shorter, but not drastically.
pub fn accept_correction(original: &str, corrected: &str) -> bool {
    let before = original.split_whitespace().count();
    let after = corrected.split_whitespace().count();
    after > 0 && after <= before && after * 10 >= before * 4
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(s: &str) -> (String, bool) {
        match parse_commands(s) {
            Spoken::Text { text, submit } => (text, submit),
            Spoken::DeleteLast => panic!("unexpected delete for {s:?}"),
        }
    }

    fn rep(from: &str, to: &str) -> TextReplacement {
        TextReplacement {
            from: from.into(),
            to: to.into(),
        }
    }

    #[test]
    fn plain_text_passes_through() {
        assert_eq!(
            text("Hallo, wie geht's?"),
            ("Hallo, wie geht's?".into(), false)
        );
    }

    #[test]
    fn new_line_and_paragraph() {
        assert_eq!(
            text("Hallo Tim, neue Zeile. wie geht's?"),
            ("Hallo Tim\nWie geht's?".into(), false)
        );
        assert_eq!(
            text("Danke dir. Neuer Absatz. Liebe Grüße neue Zeile Jamie"),
            ("Danke dir.\n\nLiebe Grüße\nJamie".into(), false)
        );
        assert_eq!(
            text("first point new line second"),
            ("first point\nSecond".into(), false)
        );
    }

    #[test]
    fn delete_inside_a_dictation_keeps_what_follows() {
        assert_eq!(
            text("Freitag der dreizehnte Obwohl Lösch das Freitag der achtzehnte"),
            ("Freitag der achtzehnte".into(), false)
        );
        assert_eq!(
            text("Freitag der dreizehnte, obwohl, lösch das, Freitag der achtzehnte."),
            ("Freitag der achtzehnte.".into(), false)
        );
        assert_eq!(
            text("Wir treffen uns um drei. Lösch das. Um vier. Abschicken."),
            ("Um vier.".into(), true)
        );
        assert_eq!(text("at three, scratch that, four"), ("Four".into(), false));
    }

    #[test]
    fn an_ordinary_lösch_das_stays_text() {
        assert_eq!(
            text("Kannst du bitte lösch das Foto sagen"),
            ("Kannst du bitte lösch das Foto sagen".into(), false)
        );
        assert_eq!(
            text("Bitte lösch das Foto aus dem Ordner."),
            ("Bitte lösch das Foto aus dem Ordner.".into(), false)
        );
    }

    #[test]
    fn a_bare_command_still_types_the_break() {
        assert_eq!(text("Neue Zeile."), ("\n".into(), false));
        assert_eq!(text("Hallo neue Zeile"), ("Hallo\n".into(), false));
    }

    #[test]
    fn submit_only_as_its_own_sentence_at_the_end() {
        assert_eq!(
            text("Bis morgen. Abschicken."),
            ("Bis morgen.".into(), true)
        );
        assert_eq!(text("Bis morgen, abschicken"), ("Bis morgen".into(), true));
        assert_eq!(text("See you. Send it."), ("See you.".into(), true));
        assert_eq!(text("Abschicken."), ("".into(), true));
        assert_eq!(
            text("Kannst du das abschicken?"),
            ("Kannst du das abschicken?".into(), false)
        );
        assert_eq!(
            text("Ich will das heute abschicken."),
            ("Ich will das heute abschicken.".into(), false)
        );
    }

    #[test]
    fn delete_only_when_it_is_the_whole_dictation() {
        assert_eq!(parse_commands("Lösch das."), Spoken::DeleteLast);
        assert_eq!(parse_commands("lösche das wieder"), Spoken::DeleteLast);
        assert_eq!(parse_commands("Scratch that!"), Spoken::DeleteLast);
        assert!(matches!(
            parse_commands("Lösch das bitte aus der Liste."),
            Spoken::Text { .. }
        ));
    }

    #[test]
    fn replacements_ignore_case_hyphens_and_keep_punctuation() {
        let reps = [
            rep("meine Mail", "jamie@example.com"),
            rep("Impressum Link", "https://example.com/impressum"),
        ];
        assert_eq!(
            apply_replacements("Schreib an Meine Mail.", &reps),
            "Schreib an jamie@example.com."
        );
        assert_eq!(
            apply_replacements("Hier der Impressum-Link", &reps),
            "Hier der https://example.com/impressum"
        );
    }

    #[test]
    fn replacements_match_whole_words_only() {
        let reps = [rep("mail", "E-Mail")];
        assert_eq!(apply_replacements("Mailbox mail", &reps), "Mailbox E-Mail");
    }

    #[test]
    fn longest_trigger_wins_and_output_is_not_replaced_again() {
        let reps = [
            rep("Younet", "Younet Marketing"),
            rep("Younet Website", "younet-marketing.de"),
        ];
        assert_eq!(
            apply_replacements("Die Younet Website von Younet", &reps),
            "Die younet-marketing.de von Younet Marketing"
        );
    }

    #[test]
    fn empty_replacement_deletes_cleanly() {
        let reps = [rep("halt", "")];
        assert_eq!(
            apply_replacements("Das ist halt so\nja halt", &reps),
            "Das ist so\nja"
        );
    }

    #[test]
    fn empty_or_blank_triggers_are_ignored() {
        let reps = [rep("  ", "x"), rep("", "y")];
        assert_eq!(apply_replacements("bleibt so", &reps), "bleibt so");
    }

    #[test]
    fn correction_cues() {
        assert!(has_correction_cue("Am Donnerstag, nein, Freitag"));
        assert!(has_correction_cue("at 3, I mean 4"));
        assert!(!has_correction_cue("Wir treffen uns am Freitag."));
        assert!(!has_correction_cue("Keine Ahnung"));
    }

    #[test]
    fn correction_guard() {
        assert!(accept_correction(
            "Am Donnerstag, nein, Freitag um drei",
            "Am Freitag um drei"
        ));
        assert!(!accept_correction("kurz", ""));
        assert!(!accept_correction(
            "Am Donnerstag nein Freitag",
            "Am Freitag, und hier noch viel mehr Text dazu"
        ));
        assert!(!accept_correction(
            "eins zwei drei vier fünf sechs sieben acht neun zehn",
            "eins"
        ));
    }
}
