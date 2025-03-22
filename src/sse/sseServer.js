const users = new Map();

// stored sse users
const addUser = (userId, res) => {
  users.set(userId, res);
  return {
    success: true,
    message: "User added successfully",
  };
};

const removeUser = async (userId) => {
  await users.delete(userId);
  return {
    success: true,
    message: "User removed successfully",
  };
};

const getUser = async (userId) => {
  if (users.has(userId)) {
    return await users.get(userId);
  }
  return null;
};

const sendMessage = async (receiverId, data) => {
  const user = await getUser(receiverId);

  if (user && data) {
    user.write(`data: ${data}\n\n`);
    return {
      success: true,
      message: "Message sent successfully",
    };
  } else {
    return {
      success: false,
      message: "Message sent unsuccessfully",
    };
  }
};

const initialize = (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  // Set CORS headers manually for SSE requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  users.set(id, res);
  console.log("Users size: ", users.size);

  req.on("close", () => {
    users.delete(id);
  });
};

module.exports = {
  SSE: {
    initialize,
    addUser,
    removeUser,
    getUser,
    sendMessage,
  },
};
