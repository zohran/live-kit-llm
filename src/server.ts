import express, { Request, Response } from "express";
import http from "http";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

// Initialize Express Application
const app = express();
const server = http.createServer(app);

const generateLiveKitToken = async (
  participantName: string,
  roomName: string,
  metadata: string
) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: participantName, // Unique identifier for the participant
      ttl: 3600 // Token expiry in seconds (1 hour)
    }
  );

  // Attach metadata to the participant
  at.addGrant({
    roomJoin: true,
    room: roomName
  });
  at.metadata = JSON.stringify(metadata); // Metadata as a JSON string

  return at.toJwt(); // Return the token
};

// Basic API endpoint to get a LiveKit token
app.get("/getLiveKitToken", async (req: any, res: any) => {
  const { userName, roomName, metadata } = req.query as {
    userName: string;
    roomName: string;
    metadata: string;
  };
  if (!userName || !roomName) {
    return res.status(400).send("Missing required parameters");
  }
  console.log("metadata : ", metadata);
  try {
    const token = await generateLiveKitToken(userName, roomName, metadata);
    res.send({ token });
  } catch (error) {
    res.status(500).send("Error generating token");
  }
});

// Start Express API server
const PORT = 5003;
server.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});
