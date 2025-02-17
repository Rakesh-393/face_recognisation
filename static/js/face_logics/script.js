document.addEventListener("DOMContentLoaded", () => {
  var labels = [];
  let detectedFaces = [];
  let sendingData = false;
  let videoStream = null;

  // Update Table
  function updateTable() {
    const selectedCourseID = document.getElementById("courseSelect").value;
    const selectedUnitCode = document.getElementById("unitSelect").value;
    const selectedVenue = document.getElementById("venueSelect").value;

    if (!selectedCourseID || !selectedUnitCode || !selectedVenue) {
      console.error("Please select all filters before updating the table.");
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "resources/pages/lecture/manageFolder.php", true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.status === "success") {
            labels = response.data;
            updateOtherElements();
            document.getElementById("studentTableContainer").innerHTML = response.html;
          } else {
            console.error("Error:", response.message);
          }
        } catch (e) {
          console.error("Failed to parse server response:", e);
        }
      }
    };

    xhr.send(
      `courseID=${encodeURIComponent(selectedCourseID)}&unitID=${encodeURIComponent(selectedUnitCode)}&venueID=${encodeURIComponent(selectedVenue)}`
    );
  }

  // Mark Attendance
  function markAttendance(detectedFaces) {
    document.querySelectorAll("#studentTableContainer tr").forEach((row) => {
      const registrationNumber = row.cells[0].innerText.trim();
      if (detectedFaces.includes(registrationNumber)) {
        row.cells[5].innerText = "Present";
      }
    });
  }

  // Load Face Models and Handle Webcam
  function updateOtherElements() {
    const video = document.getElementById("video");
    const videoContainer = document.querySelector(".video-container");
    const startButton = document.getElementById("startButton");

    if (!video || !videoContainer || !startButton) {
      console.error("Required elements for face detection are missing.");
      return;
    }

    let webcamStarted = false;
    let modelsLoaded = false;

    Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("models"),
    ])
      .then(() => {
        modelsLoaded = true;
        console.log("Face models loaded successfully.");
      })
      .catch(() => {
        alert("Error: Models not loaded. Check your model folder location.");
      });

    startButton.addEventListener("click", async () => {
      videoContainer.style.display = "flex";
      if (!webcamStarted && modelsLoaded) {
        startWebcam();
        webcamStarted = true;
      }
    });

    function startWebcam() {
      navigator.mediaDevices
        .getUserMedia({
          video: true,
          audio: false,
        })
        .then((stream) => {
          video.srcObject = stream;
          videoStream = stream;
        })
        .catch((error) => {
          console.error("Error accessing webcam:", error);
        });
    }

    async function getLabeledFaceDescriptions() {
      const labeledDescriptors = [];
      for (const label of labels) {
        const descriptions = [];
        for (let i = 1; i <= 5; i++) {
          try {
            const img = await faceapi.fetchImage(`resources/labels/${label}/${i}.png`);
            const detections = await faceapi
              .detectSingleFace(img)
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (detections) {
              descriptions.push(detections.descriptor);
            } else {
              console.log(`No face detected in ${label}/${i}.png`);
            }
          } catch (error) {
            console.error(`Error processing ${label}/${i}.png:`, error);
          }
        }

        if (descriptions.length > 0) {
          detectedFaces.push(label);
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label, descriptions));
        }
      }

      return labeledDescriptors;
    }

    video.addEventListener("play", async () => {
      const labeledFaceDescriptors = await getLabeledFaceDescriptions();
      const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

      const canvas = faceapi.createCanvasFromMedia(video);
      videoContainer.appendChild(canvas);

      const displaySize = { width: video.width, height: video.height };
      faceapi.matchDimensions(canvas, displaySize);

      setInterval(async () => {
        const detections = await faceapi
          .detectAllFaces(video)
          .withFaceLandmarks()
          .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

        const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
        detectedFaces = results.map((result) => result.label);

        markAttendance(detectedFaces);

        results.forEach((result, i) => {
          const box = resizedDetections[i].detection.box;
          const drawBox = new faceapi.draw.DrawBox(box, {
            label: result.toString(),
          });
          drawBox.draw(canvas);
        });
      }, 1000); // Reduced frequency to avoid redundant processing.
    });
  }

  // Send Attendance Data to Server
  function sendAttendanceDataToServer() {
    const attendanceData = [];
    document.querySelectorAll("#studentTableContainer tr").forEach((row, index) => {
      if (index === 0) return; // Skip header row
      const studentID = row.cells[0].innerText.trim();
      const course = row.cells[2].innerText.trim();
      const unit = row.cells[3].innerText.trim();
      const attendanceStatus = row.cells[5].innerText.trim();

      attendanceData.push({ studentID, course, unit, attendanceStatus });
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "handle_attendance", true);
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            showMessage(response.message || "Attendance recorded successfully.");
          } catch (e) {
            showMessage("Error: Failed to parse server response.");
            console.error(e);
          }
        } else {
          showMessage("Error: Unable to record attendance. HTTP Status: " + xhr.status);
        }
      }
    };

    xhr.send(JSON.stringify(attendanceData));
  }

  // Show Messages
  function showMessage(message) {
    const messageDiv = document.getElementById("messageDiv");
    if (messageDiv) {
      messageDiv.style.display = "block";
      messageDiv.innerHTML = message;
      console.log(message);
      messageDiv.style.opacity = 1;
      setTimeout(() => {
        messageDiv.style.opacity = 0;
      }, 5000);
    }
  }

  // Stop Webcam
  function stopWebcam() {
    if (videoStream) {
      const tracks = videoStream.getTracks();
      tracks.forEach((track) => track.stop());
      videoStream = null;
    }
  }

  // End Attendance Button
  const endAttendanceButton = document.getElementById("endAttendance");
  if (endAttendanceButton) {
    endAttendanceButton.addEventListener("click", () => {
      sendAttendanceDataToServer();
      const videoContainer = document.querySelector(".video-container");
      if (videoContainer) videoContainer.style.display = "none";
      stopWebcam();
    });
  }
});
