const { RFQ_Queries } = require("../data");

// const getCategory = async (description = "") => {
//   if (!description) return "Other";

//   for (const query of RFQ_Queries) {
//     if (description?.toLowerCase()?.includes(query.rfq?.toLowerCase())) {
//       // Check if the description contains the RFQ query (case insensitive)
//       return query.category;
//     } else {
//       return "Other";
//     }
//   }
// };

const getCategory = async (description = "") => {
  if (!description) return "Other";

  description = description.toLowerCase();

  for (const query of RFQ_Queries) {
    if (
      query.rfq
        .toLowerCase()
        .split(" ")
        .some((word) => description.includes(word))
    ) {
      return query.category;
    }
  }

  return "Other";
};

module.exports = {
  getCategory,
};
