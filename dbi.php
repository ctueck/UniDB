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
$request_auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : null;
# > Authorization: Bearer fds9shiis1go2grbi5c5kugdb1

/* API URLs are generally constructed as:
 *
 * .../api/{VERSION}/{Section}/{Object}/{Id}
 *
 */
if (!preg_match("#/api/".API_VERSION."(/|/([^/]+)(/|/([^/]+)(/|/([^/]+))?)?)?$#", $request_path, $matches)) {
	header("HTTP/1.1 404 Not found");
	exit(1);
}

$Section = isset($matches[2]) ? $matches[2] : null;
$Object = isset($matches[4]) ? $matches[4] : null;
$Id = isset($matches[6]) ? $matches[6] : null;

if ($Section == "login") {
	if ($_SERVER["REQUEST_METHOD"] == "POST") {
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
		header("HTTP/1.1 405 Method Not Allowed");
		header("Allowed: GET");
		die();
	}


} else {	// not a log in request

	if ($request_auth) {	// we have an Authorization header

		if (preg_match("/^[Bb]earer ([A-Za-z0-9\,\-]+)/",$request_auth, $matches)) {
			// we have a session token passed as header
			session_id($matches[1]);
			session_start();
		
			if (isset($_SESSION['UniDB']) ) {		// existing session
				if ($Section == "logout") {
					// -> we want to log out
					unset($_SESSION['UniDB']);
					session_destroy();
					die(json_encode(array(	"UniDB_goodbye" => "[bye bye]" )));
				} else {
					// -> otherwise, simply pass command to UniDB instance:
					$_SESSION['UniDB']->execCmd($_SERVER["REQUEST_METHOD"], $Section, $Object, $Id);
				}
			} else { // empty session or wrong session -> tell that user needs to log in
				requestLogin("invalid session token, or session expired");
			}
		} else {
			// header didn't match what we expected
			requestLogin("malformed Authorization header");
		}

	} else {
		// no Authorization header -> tell that user needs to log in
		requestLogin("no session token passed");
	}
}

function requestLogin($message = null) {
	// return 401 Unauthorized and ask for user login
	header("Content-type: application/json");
	header("HTTP/1.1 401 Unauthorized");
	header("WWW-Authenticate: Bearer realm=\"UniDB\"");
	die(
		json_encode(
			array(	"UniDB_requestLogin" =>	1,
				"UniDB_status" => (isset($message) ? $message : "login required" )
			)
		)
	);
}

?>
