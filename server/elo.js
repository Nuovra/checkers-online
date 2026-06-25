// Standard ELO rating system
// K-factor scales with games played (higher K for new players)

function getKFactor(gamesPlayed) {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed < 30) return 32;
  return 24;
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateNewRatings(winnerElo, loserElo, winnerGames, loserGames, isDraw = false) {
  const kWinner = getKFactor(winnerGames);
  const kLoser = getKFactor(loserGames);

  const expectedWinner = expectedScore(winnerElo, loserElo);
  const expectedLoser = expectedScore(loserElo, winnerElo);

  let scoreWinner, scoreLoser;
  if (isDraw) {
    scoreWinner = 0.5;
    scoreLoser = 0.5;
  } else {
    scoreWinner = 1;
    scoreLoser = 0;
  }

  const newWinnerElo = Math.round(winnerElo + kWinner * (scoreWinner - expectedWinner));
  const newLoserElo = Math.round(loserElo + kLoser * (scoreLoser - expectedLoser));

  return {
    newWinnerElo: Math.max(100, newWinnerElo),
    newLoserElo: Math.max(100, newLoserElo)
  };
}

module.exports = { calculateNewRatings };
