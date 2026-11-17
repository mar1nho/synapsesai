// Agrupa a saída do PTY em lotes (teto de bytes ou janela de tempo), sem mexer nos bytes.
use std::time::{Duration, Instant};

pub struct Batcher {
    max_bytes: usize,
    window: Duration,
    buf: Vec<u8>,
    since: Option<Instant>,
}

impl Batcher {
    pub fn new(max_bytes: usize, window: Duration) -> Self {
        Self { max_bytes, window, buf: Vec::new(), since: None }
    }

    /// Acrescenta bytes; devolve os lotes que já estão prontos (cheios ou com a janela vencida).
    pub fn push(&mut self, data: &[u8], now: Instant) -> Vec<Vec<u8>> {
        if self.buf.is_empty() {
            self.since = Some(now);
        }
        self.buf.extend_from_slice(data);
        let mut out = Vec::new();
        while self.buf.len() >= self.max_bytes {
            let resto = self.buf.split_off(self.max_bytes);
            out.push(std::mem::replace(&mut self.buf, resto));
            self.since = if self.buf.is_empty() { None } else { Some(now) };
        }
        if let Some(lote) = self.due(now) {
            out.push(lote);
        }
        out
    }

    /// Lote pronto por tempo (janela vencida), sem novos dados.
    pub fn due(&mut self, now: Instant) -> Option<Vec<u8>> {
        match self.since {
            Some(t) if !self.buf.is_empty() && now.duration_since(t) >= self.window => self.flush(),
            _ => None,
        }
    }

    /// Esvazia o que sobrou.
    pub fn flush(&mut self) -> Option<Vec<u8>> {
        self.since = None;
        if self.buf.is_empty() { None } else { Some(std::mem::take(&mut self.buf)) }
    }

    /// Quanto falta para a janela vencer (para o laço de leitura dormir no máximo isso).
    pub fn time_left(&self, now: Instant) -> Option<Duration> {
        self.since.map(|t| self.window.saturating_sub(now.duration_since(t)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batcher_respeita_teto_e_preserva_bytes() {
        let input: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
        let mut b = Batcher::new(65_536, Duration::from_millis(12));
        let mut out = b.push(&input, Instant::now());
        out.extend(b.flush());
        assert!(out.iter().all(|c| c.len() <= 65_536));
        assert_eq!(out.concat(), input);
    }

    #[test]
    fn batcher_nao_parte_nada_sozinho() {
        let mut b = Batcher::new(65_536, Duration::from_millis(12));
        let t = Instant::now();
        assert!(b.push(&[0xC3], t).is_empty());
        assert!(b.push(&[0xA3], t).is_empty());
        assert_eq!(b.flush().unwrap(), vec![0xC3, 0xA3]);
    }

    #[test]
    fn batcher_solta_por_tempo() {
        let mut b = Batcher::new(65_536, Duration::from_millis(12));
        let t = Instant::now();
        assert!(b.push(b"abc", t).is_empty());
        assert!(b.due(t + Duration::from_millis(5)).is_none());
        assert_eq!(b.due(t + Duration::from_millis(13)).unwrap(), b"abc".to_vec());
        assert!(b.flush().is_none());
    }
}
