export function rankFusion<T>(
  getId: (item: T) => string,
  ...resultItemsArrays: Array<Array<T>>
): Array<T> {
  // Helper function to calculate scores
  const calculateScores = (array: Array<T>) => {
    const scores: Record<string, number> = {};
    array.forEach((item, index) => {
      const id = getId(item);
      scores[id] = (array.length - index) / array.length;
    });
    return scores;
  };

  // Combine scores from all arrays
  const combinedScores: Record<string, number> = {};
  resultItemsArrays.forEach((resultItems) => {
    const scores = calculateScores(resultItems);
    for (const [id, score] of Object.entries(scores)) {
      if (combinedScores.hasOwnProperty(id)) {
        combinedScores[id] += score;
      } else {
        combinedScores[id] = score;
      }
    }
  });

  // Convert combinedScores to an array and sort by score
  const sortedResults = Object.entries(combinedScores)
    .sort((a, b) => b[1] - a[1]) // Sort by score in descending order
    .map(([id, _]) => id); // Extract the IDs

  // Map sorted IDs back to the original items
  const idToItemMap: Record<string, T> = {};
  resultItemsArrays.flat().forEach((item) => {
    idToItemMap[getId(item)] = item;
  });

  return sortedResults.map((id) => idToItemMap[id]);
}
