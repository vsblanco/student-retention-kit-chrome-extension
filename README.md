# **Submission Checker for Canvas**

The **Submission Checker** is a powerful Chrome Extension designed to automate and streamline the process of checking for student submissions within the Canvas Learning Management System. It automatically loops through a list of student gradebook pages, identifies new submissions based on a specific keyword (like the date), and provides robust tools for managing and acting on these findings.

## **✨ Key Features**

* **Automated Looping:** Automatically opens and checks a list of student gradebook pages in the background without manual intervention.  
* **Concurrent Checking:** Opens multiple tabs simultaneously to significantly speed up the checking process. The number of concurrent tabs is configurable.  
* **Master & Found Lists:** Maintain a master list of all students and automatically populate a "Found" list with students who have new submissions.  
* **External Integrations:** Connect the extension to external services like **Power Automate** and **Pusher** to trigger workflows, send notifications, or update dashboards in real-time when a submission is found.  
* **Easy List Management:** Update the entire master list in seconds by simply copying a JSON array to your clipboard and clicking a button.  
* **Customizable Search:** Change the keyword used for searching, the highlight color for found submissions, and apply filters to the looper (e.g., only check students with "Days Out \>= 5").  
* **In-Page Search:** Injects a search bar directly into the Canvas gradebook page, allowing you to quickly find and navigate to any student's gradebook from your master list.  
* **Intuitive Side Panel UI:** All features are managed through a clean, tabbed interface in the Chrome side panel.

## **🚀 Installation**

Since this is a custom extension, it needs to be loaded into Chrome in Developer Mode.

1. Download or clone this repository to your local machine.  
2. Open Google Chrome and navigate to chrome://extensions.  
3. Enable **"Developer mode"** using the toggle in the top-right corner.  
4. Click on the **"Load unpacked"** button.  
5. Select the folder where you saved the extension files.  
6. The "Submission Checker" will now appear in your extensions list and be ready to use\!

## **📋 How to Use**

### **1\. Prepare Your Master List**

The extension relies on a "Master List" of students formatted as a JSON array. Each object in the array represents one student.

Create your list using the following structure:

\[  
  {  
    "StudentName": "Doe, Jane",  
    "GradeBook": "\[https://nuc.instructure.com/courses/123/grades/456\](https://nuc.instructure.com/courses/123/grades/456)",  
    "DaysOut": 5,  
    "LDA": "2023-10-27T10:00:00Z",  
    "Grade": "95%"  
  },  
  {  
    "StudentName": "Smith, John",  
    "GradeBook": "\[https://nuc.instructure.com/courses/123/grades/457\](https://nuc.instructure.com/courses/123/grades/457)",  
    "DaysOut": 12,  
    "LDA": "2023-10-16T11:30:00Z",  
    "Grade": "88%"  
  }  
\]

* StudentName: The full name of the student.  
* GradeBook: The direct URL to the student's individual gradebook page in Canvas.  
* DaysOut, LDA, Grade: Additional data that can be used for display and filtering.

### **2\. Update the Master List**

1. Copy the entire JSON array (from the step above) to your clipboard.  
2. Open the Submission Checker side panel.  
3. Go to the **"Master List"** tab.  
4. Click the **"Update Master List"** button. The extension will read from your clipboard and populate the list.

### **3\. Start the Checker**

1. Navigate to the **"Found"** tab.  
2. Click the **"Start"** button at the top.  
3. The extension will begin opening tabs in the background and checking for submissions. The badge on the extension icon will update to show the number of found submissions.

### **4\. Configure Settings**

In the **"Settings"** tab, you can customize the extension's behavior:

* **Concurrent Tabs:** Set how many pages to check at once (1-10).  
* **Loop Filter:** Tell the looper to only check a subset of students (e.g., \>5 to only check students with more than 5 days out).  
* **Custom Keyword:** By default, the extension looks for the current date (e.g., "Sep 12 at"). You can override this with any text you want.  
* **Highlight Color:** Change the color used to highlight the found keyword.  
* **Debug Mode:** When enabled, all payloads sent to connections will have a debug: true flag.

## **🔗 Connections (Advanced)**

In the Settings tab, you can create connections to send data to external services whenever a submission is found. The following payload is sent:

{  
  "name": "Doe, Jane",  
  "time": "4:24 PM",  
  "url": "\[https://nuc.instructure.com/courses/123/grades/456\](https://nuc.instructure.com/courses/123/grades/456)",  
  "timestamp": "2025-09-12T20:24:00.000Z",  
  "grade": 95.0  
}

### **Power Automate**

* In Power Automate, create a new flow using the **"When an HTTP request is received"** trigger.  
* When you save the flow, it will generate an **HTTP POST URL**.  
* In the extension, create a new Power Automate connection and paste this URL into the HTTP Request URL field.

### **Pusher**

* Create a free account at [Pusher.com](https://pusher.com/).  
* Create a new **"Channels"** app.  
* Go to the "App Keys" section to find your App Key, App Secret, and Cluster.  
* In the extension, create a new Pusher connection and fill in these details.  
* You must specify a **Channel Name** (must begin with private-) and an **Event Name** (must begin with client-).

This project was created to simplify a repetitive but important task, allowing for more efficient student progress monitoring.
