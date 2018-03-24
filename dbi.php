<?php

/* API version */
define(API_VERSION, "v2");

/* PHP configuration */
ini_set("display_errors","stdout");
ini_set("session.auto_start",false);
ini_set("session.use_cookies",false);
ini_set("session.use_trans_sid",false);

/* load config */
require 'config/config.inc.php';

/* main UniDB class */
require 'include/UniDB.php';

/*** parse headers and API path ***/
$request_path = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : null;
$request_auth = isset($_SERVER['HTTP_X_SESSION']) ? $_SERVER['HTTP_X_SESSION'] : null;

/* API URLs are generally constructed as:
 *
 * .../api/{VERSION}/{Section}/{Object}/{Id}
 *
 */
preg_match("#/api/".API_VERSION."(/|/([^/]+)(/|/([^/]+)(/|/([^/]+))?)?)?$#", $request_path, $matches);

$Section = isset($matches[2]) ? $matches[2] : null;
$Object = isset($matches[4]) ? $matches[4] : null;
$Id = isset($matches[6]) ? $matches[6] : null;

if ($request_auth) {
	// we have a session token passed as header
	session_id($request_auth);
	session_start();

	if ($Section == "logout") {

		unset($_SESSION['UniDB']);
		session_destroy();
		die(json_encode(array(	"UniDB_goodbye" => "[bye bye]" )));

	} elseif (isset($_SESSION['UniDB']) ) {		// existing session

		// -> simply run command;
		$_SESSION['UniDB']->execCmd($_SERVER["REQUEST_METHOD"], $Section, $Object, $Id);

	} else {
		// tell that user needs to log in
		header("Content-type: application/json");
		die(json_encode(array(	"UniDB_requestLogin" =>	1,
					"UniDB_status" => "session unknown or expired" )));
	}

} else {
	// client needs to log in - details submitted?
	if (($Section == "login") && ($_SERVER["REQUEST_METHOD"] == "POST")) {
		// now we need a new session
		session_start();

		// get input and decode JSON
		$input = json_decode(file_get_contents("php://input"), true);

		// initialise new UniDB object
		$_SESSION['UniDB'] = new UniDB($UniDB_config, $input["username"], $input["password"]);
		
		// if login was incorrect we should not get to here (error in DB connect would be fatal)
		
		// return the "message of the day"
		header("Content-type: application/json");
		echo(json_encode(array("UniDB_motd" => $_SESSION['UniDB']->connectInfo(),"session" => session_id())));

	} else {

		// tell that user needs to log in
		header("Content-type: application/json");
		die(json_encode(array(	"UniDB_requestLogin" =>	1,
					"UniDB_status" => "no session ID passed" )));

	}
}


?>
